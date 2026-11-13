package com.taskflow.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

public class VoiceCommandForegroundService extends Service implements RecognitionListener {

    public static final String ACTION_START = "com.taskflow.app.VOICE_SERVICE_START";
    public static final String ACTION_STOP = "com.taskflow.app.VOICE_SERVICE_STOP";
    public static final String EXTRA_LANGUAGE = "language";

    public static final String BROADCAST_STATE = "com.taskflow.app.VOICE_STATE";
    public static final String BROADCAST_PARTIAL = "com.taskflow.app.VOICE_PARTIAL";
    public static final String BROADCAST_RESULT = "com.taskflow.app.VOICE_RESULT";
    public static final String BROADCAST_RESPONSE = "com.taskflow.app.VOICE_RESPONSE";
    public static final String BROADCAST_DATA_UPDATED = "com.taskflow.app.VOICE_DATA_UPDATED";
    public static final String BROADCAST_UI_ACTION = "com.taskflow.app.VOICE_UI_ACTION";
    public static final String BROADCAST_TOKENS_UPDATED = "com.taskflow.app.VOICE_TOKENS_UPDATED";

    private static final String CHANNEL_LISTENER = "taskflow_voice_listener";
    private static final String CHANNEL_ALERTS = "taskflow_voice_alerts";
    private static final int FOREGROUND_NOTIFICATION_ID = 4101;
    private static final int ALERT_NOTIFICATION_BASE_ID = 4200;
    private static final float SAMPLE_RATE = 16000.0f;

    private static final String WAKE_PHRASES =
        "(?:task\\s*flow|taskflow|task\\s*flo|tasks\\s*flow|tasked\\s*flow|task\\s*low|task\\s*follow|task\\s*floor|task\\s*four|task\\s*for|task\\s*slow|task\\s*glow|task\\s*blow|task\\s*float|task\\s*flaw|task\\s*full|task\\s*show|task\\s*throw|task\\s*though|task\\s*below|task\\s*hello|task\\s*fellow|task\\s*go|task\\s*no|task\\s*off|ask\\s*flow|desk\\s*flow|test\\s*flow|tax\\s*flow|that\\s*flow|the\\s*flow|talk\\s*flow|touch\\s*flow|toss\\s*flow|top\\s*flow|fast\\s*flow|past\\s*flow|pass\\s*flow|last\\s*flow|tusk\\s*flow|tech\\s*flow|text\\s*flow|tack\\s*flow|take\\s*flow)";
    private static final Pattern WAKE_PREFIX_PATTERN = Pattern.compile(
        "^(?:(?:hey|ok|okay|hi|hello)\\s+)?" + WAKE_PHRASES + "(?:\\s*[,.:;!?-]|\\s+(?:please|can you|could you)\\b)?\\s*",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern WAKE_CONTAINS_PATTERN = Pattern.compile(
        "\\b" + WAKE_PHRASES + "\\b",
        Pattern.CASE_INSENSITIVE
    );

    public static volatile boolean isServiceRunning = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private Model voskModel;
    private Recognizer voskRecognizer;
    private SpeechService voskSpeechService;

    private TextToSpeech textToSpeech;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private Runnable awakeTimeoutRunnable;
    private Runnable partialFlushRunnable;
    private Runnable ttsSafetyRunnable;
    private String lastPartialText = "";

    private boolean ttsReady = false;
    private boolean isSpeaking = false;
    private boolean isProcessing = false;
    private boolean isAwake = false;
    private boolean isInitializingModel = false;
    private int alertSequence = 0;
    private int wakeGreetingIndex = 0;
    private JSONObject lastReferencedTask = null;
    private String pendingAction = null;
    private TaskDraft activeDraft = null;
    private boolean isSubmittingDraft = false;

    private static final class TaskDraft {
        String mode = "create";
        String title = "";
        boolean hasTitle = false;
        String dueDateString = "";
        String dueTime = "";
        boolean hasDueDate = false;
        boolean dueDateSkipped = false;
        String priority = "";
        boolean hasPriority = false;
        String category = "General";
        String customDescription = "";
        String assignedTo = "";
        String assigneeName = "";
        java.util.List<String> subtasks = new java.util.ArrayList<>();
        boolean extraDetailsDone = false;
        String step = "ASK_TITLE";
    }

    private static final String[] WAKE_GREETINGS = new String[] {
        "Hey! How can I help?",
        "Yes, I'm listening. Go ahead.",
        "Hi there! What would you like me to do?"
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannels();
        initTextToSpeech();
        LibVosk.setLogLevel(LogLevel.WARNINGS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        Notification ongoing = buildOngoingNotification("Loading offline voice engine...");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FOREGROUND_NOTIFICATION_ID, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, ongoing);
        }

        isServiceRunning = true;
        startVoskEngine();
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startVoskEngine() {
        if (voskSpeechService != null) {
            voskSpeechService.setPause(false);
            emitBroadcast(BROADCAST_STATE, "state", "listening");
            return;
        }
        if (isInitializingModel) return;
        isInitializingModel = true;

        StorageService.unpack(
            getApplicationContext(),
            "model-en-in",
            "model",
            (model) -> {
                isInitializingModel = false;
                if (!isServiceRunning) {
                    model.close();
                    return;
                }
                try {
                    voskModel = model;
                    voskRecognizer = new Recognizer(voskModel, SAMPLE_RATE);
                    try {
                        voskRecognizer.setMaxAlternatives(5);
                    } catch (Exception ignored) {}
                    voskSpeechService = new SpeechService(voskRecognizer, SAMPLE_RATE);
                    voskSpeechService.startListening(this);
                    updateOngoingNotification("Listening for \"Task Flow\" — works in YouTube & other apps.");
                    emitBroadcast(BROADCAST_STATE, "state", "listening");
                } catch (Exception e) {
                    emitBroadcast(BROADCAST_STATE, "state", "error", "message", "Could not start microphone stream: " + e.getMessage());
                    postResultNotification("TaskFlow Voice Error", "Unable to start background microphone: " + e.getMessage());
                    stopSelfCleanly();
                }
            },
            (exception) -> {
                isInitializingModel = false;
                emitBroadcast(BROADCAST_STATE, "state", "error", "message", "Failed to load voice model: " + exception.getMessage());
                postResultNotification("TaskFlow Voice Error", "Failed to initialize voice model.");
                stopSelfCleanly();
            }
        );
    }

    private void stopVoskEngine() {
        cancelPartialFlush();
        if (voskSpeechService != null) {
            try {
                voskSpeechService.stop();
                voskSpeechService.shutdown();
            } catch (Exception ignored) {}
            voskSpeechService = null;
        }
        if (voskRecognizer != null) {
            try {
                voskRecognizer.close();
            } catch (Exception ignored) {}
            voskRecognizer = null;
        }
        if (voskModel != null) {
            try {
                voskModel.close();
            } catch (Exception ignored) {}
            voskModel = null;
        }
    }

    private void cancelPartialFlush() {
        if (partialFlushRunnable != null) {
            mainHandler.removeCallbacks(partialFlushRunnable);
            partialFlushRunnable = null;
        }
        lastPartialText = "";
    }

    private void setRecognizerPaused(boolean paused) {
        if (paused) {
            cancelPartialFlush();
        }
        if (voskSpeechService != null) {
            try {
                if (!paused) {
                    voskSpeechService.reset();
                }
                voskSpeechService.setPause(paused);
            } catch (Exception ignored) {}
        }
    }

    private void stopSelfCleanly() {
        isServiceRunning = false;
        cancelAwakeWindow();
        stopVoskEngine();
        abandonAudioFocus();
        emitBroadcast(BROADCAST_STATE, "state", "stopped");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NotificationManager.class);
            if (nm == null) return;

            NotificationChannel listenerChannel = new NotificationChannel(
                CHANNEL_LISTENER,
                "TaskFlow Background Voice",
                NotificationManager.IMPORTANCE_LOW
            );
            listenerChannel.setDescription("Keeps TaskFlow listening for \"Task Flow\" commands in the background.");
            nm.createNotificationChannel(listenerChannel);

            NotificationChannel alertChannel = new NotificationChannel(
                CHANNEL_ALERTS,
                "TaskFlow Voice Confirmations",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("Shows task creation and scheduling confirmations from voice commands.");
            nm.createNotificationChannel(alertChannel);
        }
    }

    private Notification buildOngoingNotification(String contentText) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, VoiceCommandForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
            this, 1, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_LISTENER)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("TaskFlow Voice Active")
            .setContentText(contentText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPending)
            .addAction(0, "Stop", stopPending)
            .build();
    }

    private void updateOngoingNotification(String contentText) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && isServiceRunning) {
            nm.notify(FOREGROUND_NOTIFICATION_ID, buildOngoingNotification(contentText));
        }
    }

    private void postResultNotification(String title, String message) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            this, 2, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openPending)
            .build();

        int id = ALERT_NOTIFICATION_BASE_ID + ((++alertSequence) % 20);
        nm.notify(id, notif);
    }

    private void initTextToSpeech() {
        if (textToSpeech != null) return;
        textToSpeech = new TextToSpeech(getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = VoiceBridgePlugin.selectBestTtsLanguage(textToSpeech);
                textToSpeech.setSpeechRate(1.0f);
                textToSpeech.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                );
                textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        isSpeaking = true;
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        isSpeaking = false;
                        mainHandler.post(() -> {
                            cancelTtsSafety();
                            if (isAwake) {
                                openAwakeWindow();
                            }
                            mainHandler.postDelayed(() -> {
                                abandonAudioFocus();
                                if (isServiceRunning && !isSpeaking) {
                                    setRecognizerPaused(false);
                                    emitBroadcast(BROADCAST_STATE, "state", "listening");
                                }
                            }, 250L);
                        });
                    }

                    @Override
                    public void onError(String utteranceId) {
                        isSpeaking = false;
                        mainHandler.post(() -> {
                            cancelTtsSafety();
                            mainHandler.postDelayed(() -> {
                                abandonAudioFocus();
                                if (isServiceRunning && !isSpeaking) {
                                    setRecognizerPaused(false);
                                    emitBroadcast(BROADCAST_STATE, "state", "listening");
                                }
                            }, 250L);
                        });
                    }
                });
            }
        });
    }

    private void requestDuckAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(
                null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            );
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }

    private void cancelTtsSafety() {
        if (ttsSafetyRunnable != null) {
            mainHandler.removeCallbacks(ttsSafetyRunnable);
            ttsSafetyRunnable = null;
        }
    }

    private void speakAloud(String text) {
        if (text == null || text.trim().isEmpty()) {
            setRecognizerPaused(false);
            return;
        }
        mainHandler.post(() -> {
            cancelTtsSafety();
            if (textToSpeech == null || !ttsReady) {
                if (isServiceRunning) {
                    setRecognizerPaused(false);
                    emitBroadcast(BROADCAST_STATE, "state", "listening");
                }
                return;
            }
            setRecognizerPaused(true);
            isSpeaking = true;
            emitBroadcast(BROADCAST_STATE, "state", "speaking");
            requestDuckAudioFocus();

            long safetyMs = Math.max(4000L, text.length() * 90L);
            ttsSafetyRunnable = () -> {
                if (isSpeaking) {
                    isSpeaking = false;
                    abandonAudioFocus();
                    if (isServiceRunning) {
                        setRecognizerPaused(false);
                        emitBroadcast(BROADCAST_STATE, "state", "listening");
                    }
                }
            };
            mainHandler.postDelayed(ttsSafetyRunnable, safetyMs);

            String utteranceId = UUID.randomUUID().toString();
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
            int speakRes = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (speakRes == TextToSpeech.ERROR) {
                cancelTtsSafety();
                isSpeaking = false;
                abandonAudioFocus();
                if (isServiceRunning) {
                    setRecognizerPaused(false);
                    emitBroadcast(BROADCAST_STATE, "state", "listening");
                }
            }
        });
    }

    // --- Vosk RecognitionListener callbacks ---

    private static boolean hasWakeMatch(String candidate) {
        if (candidate == null) return false;
        String trimmed = candidate.trim();
        if (trimmed.isEmpty()) return false;
        return WAKE_PREFIX_PATTERN.matcher(trimmed).find()
            || WAKE_CONTAINS_PATTERN.matcher(trimmed).find()
            || matchFuzzyWakeWord(trimmed) != null;
    }

    @Override
    public void onPartialResult(String hypothesis) {
        if (!isServiceRunning || isSpeaking || isProcessing || hypothesis == null) return;
        try {
            String partial = new JSONObject(hypothesis).optString("partial", "").trim();
            if (!partial.isEmpty()) {
                emitBroadcast(BROADCAST_PARTIAL, "text", partial);
                if (!partial.equals(lastPartialText)) {
                    lastPartialText = partial;
                    if (partialFlushRunnable != null) {
                        mainHandler.removeCallbacks(partialFlushRunnable);
                        partialFlushRunnable = null;
                    }
                    if (!isAwake && activeDraft == null && partial.split("\\s+").length > 25 && !hasWakeMatch(partial)) {
                        lastPartialText = "";
                        if (voskSpeechService != null) {
                            try {
                                voskSpeechService.reset();
                            } catch (Exception ignored) {}
                        }
                        return;
                    }
                    // Only fast-flush wake-word utterances when idle; never cut off mid-sentence during active commands/conversations
                    if (!isAwake && activeDraft == null && hasWakeMatch(partial)) {
                        partialFlushRunnable = () -> {
                            if (!isServiceRunning || isSpeaking || isProcessing || lastPartialText.isEmpty() || isAwake || activeDraft != null) {
                                return;
                            }
                            String flushed = lastPartialText;
                            if (hasWakeMatch(flushed)) {
                                lastPartialText = "";
                                if (voskSpeechService != null) {
                                    try {
                                        voskSpeechService.reset();
                                    } catch (Exception ignored) {}
                                }
                                handleRecognizedCandidates(java.util.Collections.singletonList(flushed));
                            }
                        };
                        mainHandler.postDelayed(partialFlushRunnable, 950L);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onResult(String hypothesis) {
        if (!isServiceRunning || isSpeaking || isProcessing || hypothesis == null) return;
        cancelPartialFlush();
        try {
            JSONObject json = new JSONObject(hypothesis);
            List<String> candidates = new ArrayList<>();

            JSONArray alts = json.optJSONArray("alternatives");
            if (alts != null) {
                for (int i = 0; i < alts.length(); i++) {
                    JSONObject alt = alts.optJSONObject(i);
                    String altText = alt != null ? alt.optString("text", "").trim() : "";
                    if (!altText.isEmpty() && !candidates.contains(altText)) {
                        candidates.add(altText);
                    }
                }
            }

            String topText = json.optString("text", "").trim();
            if (!topText.isEmpty() && !candidates.contains(topText)) {
                candidates.add(0, topText);
            }

            if (!candidates.isEmpty()) {
                handleRecognizedCandidates(candidates);
            } else {
                emitBroadcast(BROADCAST_PARTIAL, "text", "");
            }
        } catch (Exception ignored) {
            emitBroadcast(BROADCAST_PARTIAL, "text", "");
        }
    }

    @Override
    public void onFinalResult(String hypothesis) {
        onResult(hypothesis);
    }

    @Override
    public void onError(Exception exception) {
        if (!isServiceRunning) return;
        String msg = exception != null && exception.getMessage() != null
            ? exception.getMessage()
            : "Background speech recognition error.";
        emitBroadcast(BROADCAST_STATE, "state", "error", "message", msg);
    }

    @Override
    public void onTimeout() {
        // Continuous Vosk listening has no timeout when startListening(this) is used without timeout arg.
    }

    private void openAwakeWindow() {
        cancelAwakeWindow();
        isAwake = true;
        long timeoutMs = (activeDraft != null) ? 25000L : 15000L;
        awakeTimeoutRunnable = () -> {
            isAwake = false;
            pendingAction = null;
            activeDraft = null;
            isSubmittingDraft = false;
        };
        mainHandler.postDelayed(awakeTimeoutRunnable, timeoutMs);
    }

    private void cancelAwakeWindow() {
        if (awakeTimeoutRunnable != null) {
            mainHandler.removeCallbacks(awakeTimeoutRunnable);
            awakeTimeoutRunnable = null;
        }
        isAwake = false;
        pendingAction = null;
    }

    private static int levenshtein(String a, String b) {
        int m = a.length();
        int n = b.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                dp[i][j] = Math.min(Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1), dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    private static boolean isStrictTaskWord(String w) {
        return levenshtein(w, "task") <= 1 || "tasks".equals(w) || "tasked".equals(w) || "tusk".equals(w) || "tusks".equals(w) || "tass".equals(w);
    }

    private static boolean isBroadTaskWord(String w) {
        return isStrictTaskWord(w)
            || "ask".equals(w) || "desk".equals(w) || "test".equals(w) || "tax".equals(w)
            || "that".equals(w) || "talk".equals(w) || "touch".equals(w) || "toss".equals(w)
            || "top".equals(w) || "fast".equals(w) || "past".equals(w) || "pass".equals(w)
            || "last".equals(w) || "cast".equals(w) || "dash".equals(w) || "tech".equals(w)
            || "text".equals(w) || "tack".equals(w) || "take".equals(w) || "tough".equals(w);
    }

    private static boolean isStrictFlowWord(String w) {
        return levenshtein(w, "flow") <= 1 || "floe".equals(w) || "flo".equals(w);
    }

    private static boolean isBroadFlowWord(String w) {
        return isStrictFlowWord(w)
            || levenshtein(w, "flow") <= 2
            || "for".equals(w) || "four".equals(w) || "floor".equals(w) || "follow".equals(w)
            || "full".equals(w) || "show".equals(w) || "throw".equals(w) || "though".equals(w)
            || "below".equals(w) || "hello".equals(w) || "fellow".equals(w) || "float".equals(w)
            || "go".equals(w) || "no".equals(w) || "off".equals(w);
    }

    @Nullable
    private static String matchFuzzyWakeWord(String candidate) {
        String[] words = candidate.trim().split("\\s+");
        for (int i = 0; i < words.length; i++) {
            String w1 = words[i].toLowerCase(Locale.US).replaceAll("[^a-z]", "");
            if (w1.isEmpty()) continue;
            if (w1.length() >= 6 && (levenshtein(w1, "taskflow") <= 2 || w1.startsWith("taskfl") || w1.startsWith("tasklo") || "taskfollow".equals(w1) || "taskfloor".equals(w1))) {
                return joinFrom(words, i + 1);
            }
            if (i + 1 < words.length) {
                String w2 = words[i + 1].toLowerCase(Locale.US).replaceAll("[^a-z]", "");
                if (!w2.isEmpty() && ((isStrictTaskWord(w1) && isBroadFlowWord(w2)) || (isBroadTaskWord(w1) && isStrictFlowWord(w2)))) {
                    return joinFrom(words, i + 2);
                }
            }
        }
        return null;
    }

    private static String normalizeVoiceCommand(String raw) {
        if (raw == null) return "";
        return raw.trim()
            .replaceAll("(?i)\\b(?:great|creator|created|creating)\\s+(?:a\\s+|the\\s+)?task\\b", "create a task")
            .replaceAll("(?i)\\b(?:added|adding)\\s+(?:a\\s+|the\\s+)?task\\b", "add a task")
            .replaceAll("(?i)\\b(?:made|making)\\s+(?:a\\s+|the\\s+)?task\\b", "make a task")
            .replaceAll("(?i)\\bscheduled\\s+(?:a\\s+|the\\s+)?task\\b", "schedule a task")
            .replaceAll("(?i)\\b(?:the\\s+lead|deleted)\\s+(?:a\\s+|the\\s+)?task\\b", "delete task")
            .replaceAll("(?i)\\bmarket\\s+(?:as\\s+)?done\\b", "mark it done")
            .replaceAll("(?i)\\b(?:can\\s+ban|can\\s+ben|khan\\s+ban|con\\s+ban)\\b", "kanban")
            .replaceAll("(?i)\\b(?:sittings|sitting|set\\s+things)\\b", "settings")
            .replaceAll("(?i)\\bdash\\s+board\\b", "dashboard")
            .replaceAll("(?i)\\bco\\s+pilot\\b", "copilot")
            .replaceAll("(?i)\\bup\\s+coming\\b", "upcoming")
            .replaceAll("(?i)\\ball\\s+task\\b", "all tasks")
            .replaceAll("(?i)\\bmy\\s+(?:date|dear)\\b", "my day")
            .trim();
    }

    private static String joinFrom(String[] words, int startIdx) {
        StringBuilder sb = new StringBuilder();
        for (int i = startIdx; i < words.length; i++) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(words[i]);
        }
        return sb.toString();
    }

    private void handleRecognizedCandidates(List<String> candidates) {
        emitBroadcast(BROADCAST_PARTIAL, "text", "");

        String primary = candidates.get(0).trim();
        String matchedTranscript = primary;
        String extractedCommand = null;
        boolean wakeOnly = false;

        for (String raw : candidates) {
            String trimmed = raw.trim();
            Matcher prefixMatcher = WAKE_PREFIX_PATTERN.matcher(trimmed);
            if (prefixMatcher.find()) {
                matchedTranscript = trimmed;
                String rem = trimmed.substring(prefixMatcher.end())
                    .replaceFirst("^(?:please|can you|could you)\\s+", "")
                    .trim();
                if (rem.isEmpty()) wakeOnly = true; else extractedCommand = rem;
                break;
            }

            Matcher inlineMatcher = WAKE_CONTAINS_PATTERN.matcher(trimmed);
            if (inlineMatcher.find()) {
                matchedTranscript = trimmed;
                String after = trimmed.substring(inlineMatcher.end())
                    .replaceFirst("^[,.:;!?\\-\\s]+", "")
                    .replaceFirst("^(?:please|can you|could you)\\s+", "")
                    .trim();
                if (after.isEmpty()) wakeOnly = true; else extractedCommand = after;
                break;
            }

            String fuzzyRem = matchFuzzyWakeWord(trimmed);
            if (fuzzyRem != null) {
                matchedTranscript = trimmed;
                String cleaned = fuzzyRem
                    .replaceFirst("^[,.:;!?\\-\\s]+", "")
                    .replaceFirst("^(?:please|can you|could you)\\s+", "")
                    .trim();
                if (cleaned.isEmpty()) wakeOnly = true; else extractedCommand = cleaned;
                break;
            }
        }

        if (extractedCommand == null && !wakeOnly && isAwake) {
            extractedCommand = primary;
        }

        if (wakeOnly) {
            openAwakeWindow();
            String greet = WAKE_GREETINGS[(wakeGreetingIndex++) % WAKE_GREETINGS.length];
            emitBroadcast(BROADCAST_RESULT, "text", matchedTranscript);
            emitBroadcast(BROADCAST_RESPONSE, "text", greet);
            speakAloud(greet);
            return;
        }

        if (extractedCommand == null || extractedCommand.isEmpty()) {
            return;
        }

        final String activePending = pendingAction;
        cancelAwakeWindow();
        final String command = normalizeVoiceCommand(extractedCommand);
        emitBroadcast(BROADCAST_RESULT, "text", matchedTranscript);

        setRecognizerPaused(true);
        isProcessing = true;
        emitBroadcast(BROADCAST_STATE, "state", "processing");

        executor.execute(() -> {
            CommandOutcome outcome = executeCommandInBackground(command, activePending);
            isProcessing = false;

            if (outcome.stopService) {
                postResultNotification("TaskFlow Voice Stopped", outcome.speech);
                speakAloud(outcome.speech);
                mainHandler.postDelayed(this::stopSelfCleanly, 2200L);
                return;
            }

            if (outcome.keepAwake) {
                mainHandler.post(() -> {
                    openAwakeWindow();
                    pendingAction = outcome.nextPendingAction;
                });
            }

            if (outcome.dataMutated) {
                emitBroadcast(BROADCAST_DATA_UPDATED, "action", outcome.notifTitle);
            }

            emitBroadcast(BROADCAST_RESPONSE, "text", outcome.speech);
            postResultNotification(outcome.notifTitle, outcome.speech);
            speakAloud(outcome.speech);
        });
    }

    private static class CommandOutcome {
        final String notifTitle;
        final String speech;
        final boolean dataMutated;
        final boolean stopService;
        final boolean keepAwake;
        final String nextPendingAction;

        CommandOutcome(String notifTitle, String speech, boolean dataMutated, boolean stopService) {
            this(notifTitle, speech, dataMutated, stopService, false, null);
        }

        CommandOutcome(String notifTitle, String speech, boolean dataMutated, boolean stopService, boolean keepAwake, String nextPendingAction) {
            this.notifTitle = notifTitle;
            this.speech = speech;
            this.dataMutated = dataMutated;
            this.stopService = stopService;
            this.keepAwake = keepAwake;
            this.nextPendingAction = nextPendingAction;
        }
    }

    private String stripPoliteFillers(String raw) {
        return raw
            .replaceFirst("(?i)^(?:hey|hi|hello|okay|ok|alright|actually|well|um|uh)(?:,\\s*|\\s+|$)", "")
            .replaceFirst("(?i)^(?:can you|could you|would you|will you|please|kindly)\\s+", "")
            .replaceFirst("(?i)^(?:please|just)\\s+", "")
            .replaceFirst("(?i)\\s+(?:for me|please)$", "")
            .trim();
    }

    private String formatHumanDate(String ymd) {
        if (ymd == null || ymd.isEmpty() || "null".equals(ymd)) return "";
        try {
            SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar now = Calendar.getInstance();
            String today = parser.format(now.getTime());
            if (ymd.equals(today)) return "today";
            now.add(Calendar.DAY_OF_YEAR, 1);
            if (ymd.equals(parser.format(now.getTime()))) return "tomorrow";
            java.util.Date parsed = parser.parse(ymd);
            if (parsed != null) {
                SimpleDateFormat humanFmt = new SimpleDateFormat("EEEE, MMMM d", Locale.US);
                return "on " + humanFmt.format(parsed);
            }
        } catch (Exception ignored) {}
        return "for " + ymd;
    }

    private void bringAppToFront() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(launch);
    }

    @Nullable
    private static String[] resolveViewTarget(String phrase) {
        String clean = phrase.toLowerCase(Locale.US)
            .replaceFirst("^(?:open|go to|show me|show|navigate to|switch to|take me to|check|view)\\s+(?:the\\s+)?", "")
            .trim();
        switch (clean) {
            case "dashboard":
            case "home":
            case "overview":
                return new String[] { "dashboard", "Dashboard" };
            case "ai":
            case "ai assistant":
            case "ai view":
            case "assistant":
            case "scheduler":
                return new String[] { "ai", "AI Assistant" };
            case "all tasks":
            case "tasks":
            case "task list":
            case "my list":
                return new String[] { "all", "All Tasks" };
            case "kanban":
            case "kanban board":
            case "board":
                return new String[] { "board", "Kanban Board" };
            case "my day":
            case "today":
            case "today view":
                return new String[] { "today", "My Day" };
            case "upcoming":
            case "upcoming tasks":
            case "upcoming schedule":
                return new String[] { "upcoming", "Upcoming Tasks" };
            case "completed":
            case "completed tasks":
            case "done tasks":
                return new String[] { "completed", "Completed Tasks" };
            case "team":
            case "teams":
            case "members":
            case "team members":
            case "team and members":
                return new String[] { "team", "Team and Members" };
            case "billing":
            case "plans":
            case "subscription":
            case "billing and plans":
                return new String[] { "billing", "Billing and Plans" };
            case "settings":
            case "setting":
            case "account settings":
            case "profile":
            case "preferences":
                return new String[] { "settings", "Settings" };
            case "trash":
            case "recovery":
            case "recycle bin":
            case "trash and recovery":
                return new String[] { "trash", "Trash and Recovery" };
            default:
                return null;
        }
    }

    private CommandOutcome executeCommandInBackground(String rawCommand, @Nullable String activePending) {
        String command = stripPoliteFillers(rawCommand);
        String lower = command.toLowerCase(Locale.US).trim();

        if (lower.matches("^(stop listening|pause listening|mute voice|go to sleep|sleep|never mind|cancel)$")) {
            return new CommandOutcome("TaskFlow Voice", "Okay, pausing background voice assistant.", false, true);
        }

        if (lower.matches("^(thank you|thanks|thanks a lot|awesome|great job|good job|bye|goodbye|see you|that's all)$")) {
            return new CommandOutcome("TaskFlow", "You're welcome! Just say Task Flow whenever you need me.", false, false);
        }

        if (lower.matches("^(good morning|good afternoon|good evening|hi|hello|hey there|hey)$")) {
            int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
            String greet = hour < 12 ? "Good morning!" : (hour < 17 ? "Good afternoon!" : "Good evening!");
            return new CommandOutcome("TaskFlow", greet + " I'm ready to help with your tasks. What would you like to do?", false, false, true, null);
        }

        if (lower.matches("^(how are you|how are you doing|how's it going|what's up)\\??$")) {
            return new CommandOutcome("TaskFlow", "I'm doing great and ready to keep your day organized! How can I help?", false, false, true, null);
        }

        if (lower.matches("^(who are you|what is your name|what's your name)\\??$")) {
            return new CommandOutcome("TaskFlow", "I'm TaskFlow, your personal voice assistant. Tell me to schedule tasks or check your day.", false, false, true, null);
        }

        if (lower.matches("^(open app|open taskflow)$")) {
            bringAppToFront();
            return new CommandOutcome("TaskFlow Opened", "Sure, opening TaskFlow.", false, false);
        }

        if (lower.matches("^(?:open|show)\\s+(?:ai\\s+)?copilot$")) {
            bringAppToFront();
            emitBroadcast(BROADCAST_UI_ACTION, "action", "copilot", "target", "open");
            return new CommandOutcome("AI Copilot", "Opening AI Copilot.", false, false);
        }
        if (lower.matches("^(?:close|hide)\\s+(?:ai\\s+)?copilot$")) {
            emitBroadcast(BROADCAST_UI_ACTION, "action", "copilot", "target", "close");
            return new CommandOutcome("AI Copilot", "Closing AI Copilot.", false, false);
        }
        if (lower.matches("^(?:open|show)\\s+(?:menu|sidebar)$")) {
            bringAppToFront();
            emitBroadcast(BROADCAST_UI_ACTION, "action", "sidebar", "target", "open");
            return new CommandOutcome("Menu", "Opening the menu.", false, false);
        }
        if (lower.matches("^(?:close|hide)\\s+(?:menu|sidebar)$")) {
            emitBroadcast(BROADCAST_UI_ACTION, "action", "sidebar", "target", "close");
            return new CommandOutcome("Menu", "Closing the menu.", false, false);
        }
        if (lower.matches("^(?:help|voice commands|what can you do|show commands|commands)$")) {
            bringAppToFront();
            emitBroadcast(BROADCAST_UI_ACTION, "action", "open_voice_help", "target", "");
            return new CommandOutcome("Voice Commands", "Opening the voice command guide.", false, false);
        }
        if (lower.matches("^(?:refresh|sync|reload|sync tasks)$")) {
            emitBroadcast(BROADCAST_UI_ACTION, "action", "refresh", "target", "");
            return new CommandOutcome("Workspace Refreshed", "Refreshing your workspace.", false, false);
        }

        String[] viewTarget = resolveViewTarget(lower);
        if (viewTarget != null) {
            bringAppToFront();
            emitBroadcast(BROADCAST_UI_ACTION, "action", "navigate", "target", viewTarget[0]);
            return new CommandOutcome("Opening " + viewTarget[1], "Opening " + viewTarget[1] + ".", false, false);
        }

        String token = VoiceSessionStore.getToken(this);
        if (token == null || token.isEmpty()) {
            return new CommandOutcome(
                "Sign In Required",
                "Please sign in to TaskFlow first so I can access your tasks.",
                false,
                false
            );
        }

        try {
            if (activeDraft != null) {
                return advanceTaskConversationInBackground(command);
            }
            if ("COMPLETE".equals(activePending)) {
                return completeTaskByQuery(command);
            }
            if ("DELETE".equals(activePending)) {
                return deleteTaskByQuery(command);
            }
            if ("START".equals(activePending)) {
                return startTaskByQuery(command);
            }
            if ("EDIT".equals(activePending)) {
                return editTaskByQuery(command);
            }

            // 1. Schedule / Create Task (conversational multi-turn flow)
            boolean isSchedule = lower.matches("^(schedule(\\s+a)?\\s+task|schedule|remind me to|don't let me forget to|set(\\s+a)?\\s+reminder(\\s+to)?)\\b.*");
            boolean isCreate = lower.matches("^(?:(?:i\\s+(?:want|would\\s+like|need)\\s+to|help\\s+me|let'?s)\\s+)?(?:create|add|new|make|start)(?:\\s+(?:a|an|the))?(?:\\s+new)?\\s+task\\b.*")
                || lower.matches("^(i need to|i have to|i want to|i gotta|put)\\s+.+");

            if (isSchedule || isCreate) {
                return startTaskConversationInBackground(command, isSchedule ? "schedule" : "create");
            }

            // 2. Complete Task
            if (lower.matches("^(complete|finish|done|i finished|i completed|i'm done with|check off|mark(\\s+task)?\\s+as\\s+(completed|done))\\b.*")
                || lower.matches("^mark\\s+.+\\s+(as\\s+)?(done|completed)$")) {
                String query = lower.startsWith("mark ")
                    ? command.replaceFirst("(?i)^mark\\s+(task\\s+)?", "").replaceFirst("(?i)\\s+(as\\s+)?(done|completed)$", "").trim()
                    : command
                        .replaceFirst("(?i)^(complete|finish|done|i finished|i completed|i'm done with|check off|mark(\\s+task)?\\s+as\\s+(completed|done))\\s+(a\\s+)?(task\\s+)?", "")
                        .replaceFirst("(?i)^(called|named|name|titled)\\s+", "")
                        .trim();
                if (query.isEmpty()) {
                    return new CommandOutcome("Which Task?", "Sure, which task did you finish?", false, false, true, "COMPLETE");
                }
                return completeTaskByQuery(query);
            }

            // 3. Start / In Progress
            if (lower.matches("^(start|begin)\\s+.*") || lower.matches("^(move|set)\\s+.+\\s+(to\\s+)?in\\s+progress$")) {
                String query = (lower.startsWith("move ") || lower.startsWith("set "))
                    ? command.replaceFirst("(?i)^(move|set)\\s+(task\\s+)?", "").replaceFirst("(?i)\\s+(to\\s+)?in\\s+progress$", "").trim()
                    : command
                        .replaceFirst("(?i)^(start|begin)\\s+(a\\s+)?(task\\s+)?", "")
                        .replaceFirst("(?i)^(called|named|name|titled)\\s+", "")
                        .trim();
                if (query.isEmpty()) {
                    return new CommandOutcome("Which Task?", "Which task would you like to start?", false, false, true, "START");
                }
                return startTaskByQuery(query);
            }

            // 4. Priority change ("make it high priority", "set Python to high priority", "set priority of Python to high")
            if (lower.matches("^(make|set|change)\\s+(.+?)\\s+(to\\s+)?(high|medium|low)\\s+priority$")) {
                Matcher pm = Pattern.compile("^(?:make|set|change)\\s+(.+?)\\s+(?:to\\s+)?(high|medium|low)\\s+priority$", Pattern.CASE_INSENSITIVE).matcher(command);
                if (pm.find()) {
                    String query = pm.group(1).trim();
                    String priority = pm.group(2).toLowerCase(Locale.US);
                    JSONObject task = resolveTaskReference(query, null);
                    if (task == null) {
                        return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task called " + query + ".", false, false);
                    }
                    apiRequest("PUT", "/tasks/" + task.getString("_id"), new JSONObject().put("priority", priority));
                    lastReferencedTask = task;
                    return new CommandOutcome("Priority Updated", "Sure! I changed " + task.optString("title") + " to " + priority + " priority.", true, false);
                }
            }

            Matcher prioOfM = Pattern.compile("^(?:set|change)\\s+priority\\s+(?:of\\s+)?(.+?)\\s+(?:to\\s+)?(high|medium|low)$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (prioOfM.find()) {
                String query = prioOfM.group(1).trim();
                String priority = prioOfM.group(2).toLowerCase(Locale.US);
                JSONObject task = resolveTaskReference(query, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task called " + query + ".", false, false);
                }
                apiRequest("PUT", "/tasks/" + task.getString("_id"), new JSONObject().put("priority", priority));
                lastReferencedTask = task;
                return new CommandOutcome("Priority Updated", "Sure! I changed " + task.optString("title") + " to " + priority + " priority.", true, false);
            }

            // 4b. Edit / Modify / Update Task
            if (lower.matches("^(edit|modify|update)(\\s+task)?\\b.*")) {
                Matcher editPrioM = Pattern.compile("\\bpriority\\s+(?:to\\s+)?(high|medium|low)\\b", Pattern.CASE_INSENSITIVE).matcher(command);
                if (editPrioM.find()) {
                    String prio = editPrioM.group(1).toLowerCase(Locale.US);
                    String query = command
                        .replaceFirst("(?i)^(?:edit|modify|update)\\s+(?:task\\s+)?", "")
                        .replaceAll("(?i)\\b(?:set\\s+)?priority\\s+(?:to\\s+)?(?:high|medium|low)\\b", "")
                        .trim();
                    JSONObject task = resolveTaskReference(query, null);
                    if (task == null) {
                        return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + query + ".", false, false);
                    }
                    apiRequest("PUT", "/tasks/" + task.getString("_id"), new JSONObject().put("priority", prio));
                    lastReferencedTask = task;
                    return new CommandOutcome("Priority Updated", "Sure! I changed " + task.optString("title") + " to " + prio + " priority.", true, false);
                }
                String query = command
                    .replaceFirst("(?i)^(?:edit|modify|update)\\s+(?:a\\s+)?(?:task\\s+)?", "")
                    .replaceFirst("(?i)^(?:called|named|name|titled)\\s+", "")
                    .trim();
                if (query.isEmpty()) {
                    return new CommandOutcome("Which Task?", "Which task would you like to edit?", false, false, true, "EDIT");
                }
                return editTaskByQuery(query);
            }

            // 4c. Reopen completed task
            if (lower.matches("^(reopen|uncomplete|undo complete)\\b.*")) {
                String query = command
                    .replaceFirst("(?i)^(?:reopen|uncomplete|undo complete)\\s+(?:a\\s+)?(?:task\\s+)?", "")
                    .replaceFirst("(?i)^(?:called|named|name|titled)\\s+", "")
                    .trim();
                JSONObject task = resolveTaskReference(query, "completed");
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "I couldn't find a completed task matching " + query + ".", false, false);
                }
                apiRequest("PATCH", "/tasks/" + task.getString("_id") + "/toggle", new JSONObject());
                lastReferencedTask = task;
                return new CommandOutcome("Task Reopened", "Okay, I've reopened " + task.optString("title") + ".", true, false);
            }

            // 4d. Permanently delete task / Empty trash
            if (lower.matches("^(empty|clear)\\s+trash$")) {
                apiRequest("DELETE", "/tasks/trash/empty", null);
                return new CommandOutcome("Trash Emptied", "Your trash is now empty.", true, false);
            }

            if (lower.matches("^(permanently\\s+delete|delete\\s+permanently|forever\\s+delete)\\s+.*")) {
                String query = command
                    .replaceFirst("(?i)^(?:permanently\\s+delete|delete\\s+permanently|forever\\s+delete)\\s+(?:a\\s+)?(?:task\\s+)?", "")
                    .replaceFirst("(?i)^(?:called|named|name|titled)\\s+", "")
                    .trim();
                JSONObject trashRes = apiRequest("GET", "/tasks/trash?limit=50", null);
                JSONObject task = pickBestTask(trashRes.optJSONArray("tasks"), query);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "I couldn't find a deleted task matching " + query + " in the trash.", false, false);
                }
                apiRequest("DELETE", "/tasks/" + task.getString("_id") + "/permanent", null);
                return new CommandOutcome("Permanently Deleted", "Permanently deleted " + task.optString("title") + ".", true, false);
            }

            // 5. Delete Task
            if (lower.matches("^(delete|remove|trash|cancel|get rid of)\\s+.*")) {
                String query = command
                    .replaceFirst("(?i)^(delete|remove|trash|cancel|get rid of)\\s+(a\\s+)?(task\\s+)?", "")
                    .replaceFirst("(?i)^(called|named|name|titled)\\s+", "")
                    .trim();
                if (query.isEmpty()) {
                    return new CommandOutcome("Which Task?", "Which task should I move to the trash?", false, false, true, "DELETE");
                }
                return deleteTaskByQuery(query);
            }

            // 6. Restore Task
            if (lower.matches("^(restore|recover)\\s+.*")) {
                String query = command
                    .replaceFirst("(?i)^(restore|recover)\\s+(a\\s+)?(task\\s+)?", "")
                    .replaceFirst("(?i)^(called|named|name|titled)\\s+", "")
                    .trim();
                JSONObject trashRes = apiRequest("GET", "/tasks/trash?limit=50", null);
                JSONObject task = pickBestTask(trashRes.optJSONArray("tasks"), query);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "I couldn't find a deleted task matching " + query + ".", false, false);
                }
                apiRequest("PATCH", "/tasks/" + task.getString("_id") + "/restore", new JSONObject());
                lastReferencedTask = task;
                return new CommandOutcome("Task Restored", "Done! I've restored " + task.optString("title") + ".", true, false);
            }

            // 6b. Subtasks, Comments, Details, Reschedule, Rename, Move Status, Bulk Actions
            if (lower.matches("^(?:add|create|new)\\s+(?:a\\s+)?subtask\\s+.*")) {
                Matcher subAddM = Pattern.compile("^(?:add|create|new)\\s+(?:a\\s+)?subtask\\s+(.+)\\s+(?:to|for|on|under)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
                String subTitle;
                String taskQuery;
                if (subAddM.find()) {
                    subTitle = subAddM.group(1).trim();
                    taskQuery = subAddM.group(2).trim();
                } else {
                    subTitle = command.replaceFirst("(?i)^(?:add|create|new)\\s+(?:a\\s+)?subtask\\s+", "").trim();
                    taskQuery = "it";
                }
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                apiRequest("POST", "/tasks/" + task.getString("_id") + "/subtasks", new JSONObject().put("title", subTitle));
                lastReferencedTask = task;
                return new CommandOutcome("Subtask Added", "Added subtask " + subTitle + " to " + task.optString("title") + ".", true, false);
            }

            if (lower.matches("^(?:complete|finish|check off|toggle)\\s+subtask\\s+.*")) {
                Matcher subCompM = Pattern.compile("^(?:complete|finish|check off|toggle)\\s+subtask\\s+(.+)\\s+(?:on|of|in|for|from)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
                String subQuery;
                String taskQuery;
                if (subCompM.find()) {
                    subQuery = subCompM.group(1).trim();
                    taskQuery = subCompM.group(2).trim();
                } else {
                    subQuery = command.replaceFirst("(?i)^(?:complete|finish|check off|toggle)\\s+subtask\\s+", "").trim();
                    taskQuery = "it";
                }
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                JSONObject fullTask = apiRequest("GET", "/tasks/" + task.getString("_id"), null).optJSONObject("task");
                if (fullTask == null) fullTask = task;
                JSONObject sub = pickBestSubtask(fullTask.optJSONArray("subtasks"), subQuery);
                if (sub == null) {
                    return new CommandOutcome("Subtask Not Found", "I couldn't find a subtask matching " + subQuery + " on " + fullTask.optString("title") + ".", false, false);
                }
                boolean nextDone = !sub.optBoolean("isCompleted", false);
                apiRequest("PATCH", "/tasks/" + fullTask.getString("_id") + "/subtasks/" + sub.getString("_id"), new JSONObject().put("isCompleted", nextDone));
                lastReferencedTask = fullTask;
                return new CommandOutcome("Subtask Updated", "Marked subtask " + sub.optString("title") + " as " + (nextDone ? "completed" : "incomplete") + ".", true, false);
            }

            if (lower.matches("^(?:delete|remove)\\s+subtask\\s+.*")) {
                Matcher subDelM = Pattern.compile("^(?:delete|remove)\\s+subtask\\s+(.+)\\s+(?:from|on|of|in)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
                String subQuery;
                String taskQuery;
                if (subDelM.find()) {
                    subQuery = subDelM.group(1).trim();
                    taskQuery = subDelM.group(2).trim();
                } else {
                    subQuery = command.replaceFirst("(?i)^(?:delete|remove)\\s+subtask\\s+", "").trim();
                    taskQuery = "it";
                }
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                JSONObject fullTask = apiRequest("GET", "/tasks/" + task.getString("_id"), null).optJSONObject("task");
                if (fullTask == null) fullTask = task;
                JSONObject sub = pickBestSubtask(fullTask.optJSONArray("subtasks"), subQuery);
                if (sub == null) {
                    return new CommandOutcome("Subtask Not Found", "I couldn't find a subtask matching " + subQuery + " on " + fullTask.optString("title") + ".", false, false);
                }
                apiRequest("DELETE", "/tasks/" + fullTask.getString("_id") + "/subtasks/" + sub.getString("_id"), null);
                lastReferencedTask = fullTask;
                return new CommandOutcome("Subtask Deleted", "Removed subtask " + sub.optString("title") + " from " + fullTask.optString("title") + ".", true, false);
            }

            if (lower.matches("^(?:add\\s+(?:a\\s+)?comment|comment)\\s+.*")) {
                Matcher commentAddM = Pattern.compile("^(?:add\\s+(?:a\\s+)?comment|comment)\\s+(.+)\\s+(?:to|on|for)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
                String content;
                String taskQuery;
                if (commentAddM.find()) {
                    content = commentAddM.group(1).trim();
                    taskQuery = commentAddM.group(2).trim();
                } else {
                    content = command.replaceFirst("(?i)^(?:add\\s+(?:a\\s+)?comment|comment)\\s+", "").trim();
                    taskQuery = "it";
                }
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                apiRequest("POST", "/tasks/" + task.getString("_id") + "/comments", new JSONObject().put("content", content));
                lastReferencedTask = task;
                return new CommandOutcome("Comment Added", "Added your comment to " + task.optString("title") + ".", true, false);
            }

            Matcher commentReadM = Pattern.compile("^(?:read|show|check)\\s+comments(?:\\s+(?:on|of|for)\\s+(.+))?$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (commentReadM.find()) {
                String taskQuery = commentReadM.group(1) != null ? commentReadM.group(1).trim() : "it";
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                JSONObject fullTask = apiRequest("GET", "/tasks/" + task.getString("_id"), null).optJSONObject("task");
                JSONArray comments = fullTask != null ? fullTask.optJSONArray("comments") : null;
                lastReferencedTask = task;
                if (comments == null || comments.length() == 0) {
                    return new CommandOutcome("Comments", task.optString("title") + " has no comments yet.", false, false);
                }
                JSONObject latest = comments.getJSONObject(comments.length() - 1);
                return new CommandOutcome("Comments", task.optString("title") + " has " + comments.length() + " comments. Latest: " + latest.optString("content", "") + ".", false, false);
            }

            Matcher detailsM = Pattern.compile("^(?:read|show|get)\\s+(?:details|info)(?:\\s+(?:of|for|about)\\s+(.+))?$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (detailsM.find()) {
                String taskQuery = detailsM.group(1) != null ? detailsM.group(1).trim() : "it";
                JSONObject task = resolveTaskReference(taskQuery, null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + taskQuery + ".", false, false);
                }
                JSONObject t = apiRequest("GET", "/tasks/" + task.getString("_id"), null).optJSONObject("task");
                if (t == null) t = task;
                lastReferencedTask = t;
                String due = formatHumanDate(t.optString("dueDateString", ""));
                String duePart = !due.isEmpty() ? (", due " + due) : "";
                JSONArray subs = t.optJSONArray("subtasks");
                String subPart = (subs != null && subs.length() > 0) ? (", with " + subs.length() + " subtasks") : "";
                String statusText = t.optString("status", "pending").replace('_', ' ');
                return new CommandOutcome("Task Details", t.optString("title") + " is " + statusText + " with " + t.optString("priority", "medium") + " priority" + duePart + subPart + ".", false, false);
            }

            Matcher reschedM = Pattern.compile("^(?:reschedule|postpone|defer)\\s+(.+?)\\s+(?:to|for)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (reschedM.find()) {
                JSONObject task = resolveTaskReference(reschedM.group(1).trim(), null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + reschedM.group(1).trim() + ".", false, false);
                }
                JSONObject dateDraft = parseTaskPayload("schedule task " + reschedM.group(2).trim());
                JSONObject update = new JSONObject();
                if (dateDraft.has("dueDate")) update.put("dueDate", dateDraft.optString("dueDate"));
                if (dateDraft.has("dueDateString")) update.put("dueDateString", dateDraft.optString("dueDateString"));
                apiRequest("PUT", "/tasks/" + task.getString("_id"), update);
                lastReferencedTask = task;
                String human = formatHumanDate(dateDraft.optString("dueDateString", ""));
                return new CommandOutcome("Task Rescheduled", "Rescheduled " + task.optString("title") + (human.isEmpty() ? "." : " to " + human + "."), true, false);
            }

            Matcher renameM = Pattern.compile("^rename\\s+(.+?)\\s+to\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (renameM.find()) {
                JSONObject task = resolveTaskReference(renameM.group(1).trim(), null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + renameM.group(1).trim() + ".", false, false);
                }
                String newTitle = cleanSpokenTitle(renameM.group(2).trim());
                apiRequest("PUT", "/tasks/" + task.getString("_id"), new JSONObject().put("title", newTitle));
                task.put("title", newTitle);
                lastReferencedTask = task;
                return new CommandOutcome("Task Renamed", "Renamed task to " + newTitle + ".", true, false);
            }

            Matcher moveStatusM = Pattern.compile("^(?:move|set)\\s+(.+?)\\s+(?:to|as)\\s+(todo|to do|pending|in progress|review|completed|done)$", Pattern.CASE_INSENSITIVE).matcher(command);
            if (moveStatusM.find()) {
                JSONObject task = resolveTaskReference(moveStatusM.group(1).trim(), null);
                if (task == null) {
                    return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + moveStatusM.group(1).trim() + ".", false, false);
                }
                String rawStatus = moveStatusM.group(2).toLowerCase(Locale.US);
                String status = "in progress".equals(rawStatus)
                    ? "in_progress"
                    : ("review".equals(rawStatus)
                        ? "review"
                        : (("completed".equals(rawStatus) || "done".equals(rawStatus)) ? "completed" : "pending"));
                apiRequest("PATCH", "/tasks/" + task.getString("_id") + "/status", new JSONObject().put("status", status));
                lastReferencedTask = task;
                return new CommandOutcome("Status Updated", "Moved " + task.optString("title") + " to " + status.replace('_', ' ') + ".", true, false);
            }

            if (lower.matches("^(complete|mark)\\s+all\\s+(overdue|today|pending)\\s+tasks.*$")) {
                String scope = lower.contains("overdue") ? "overdue" : (lower.contains("today") ? "today" : "pending");
                String queryParam = "overdue".equals(scope) ? "view=overdue&limit=100" : ("today".equals(scope) ? "view=today&limit=100" : "status=pending&limit=100");
                JSONObject listRes = apiRequest("GET", "/tasks?" + queryParam, null);
                JSONArray arr = listRes.optJSONArray("tasks");
                JSONArray ids = new JSONArray();
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) ids.put(arr.getJSONObject(i).getString("_id"));
                }
                if (ids.length() == 0) {
                    return new CommandOutcome("No Tasks", "You have no " + scope + " tasks right now.", false, false);
                }
                apiRequest("POST", "/tasks/bulk", new JSONObject().put("taskIds", ids).put("operation", "status").put("payload", "completed"));
                return new CommandOutcome("Bulk Complete", "Completed " + ids.length() + " " + scope + " tasks.", true, false);
            }

            if (lower.matches("^(delete|clear)\\s+all\\s+(completed|overdue)\\s+tasks$")) {
                String scope = lower.contains("completed") ? "completed" : "overdue";
                String queryParam = "completed".equals(scope) ? "status=completed&limit=100" : "view=overdue&limit=100";
                JSONObject listRes = apiRequest("GET", "/tasks?" + queryParam, null);
                JSONArray arr = listRes.optJSONArray("tasks");
                JSONArray ids = new JSONArray();
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) ids.put(arr.getJSONObject(i).getString("_id"));
                }
                if (ids.length() == 0) {
                    return new CommandOutcome("No Tasks", "You have no " + scope + " tasks right now.", false, false);
                }
                apiRequest("POST", "/tasks/bulk", new JSONObject().put("taskIds", ids).put("operation", "delete"));
                return new CommandOutcome("Bulk Delete", "Deleted " + ids.length() + " " + scope + " tasks.", true, false);
            }

            // 7. Stats / Overdue / Today / Reminders / Optimize / Breakdown
            if (lower.matches(".*\\b(task summary|dashboard summary|how many tasks|show stats|task stats|my stats|how am i doing)\\b.*")) {
                JSONObject res = apiRequest("GET", "/tasks/stats", null);
                JSONObject s = res.optJSONObject("stats");
                if (s != null) {
                    String speech = String.format(
                        Locale.US,
                        "Right now you have %d total tasks: %d pending, %d due today, %d overdue, and %d completed.",
                        s.optInt("total", 0), s.optInt("pending", 0), s.optInt("dueToday", 0),
                        s.optInt("overdue", 0), s.optInt("completed", 0)
                    );
                    return new CommandOutcome("Task Summary", speech, false, false);
                }
            }

            if (lower.matches(".*\\b(overdue tasks|what is overdue|what's overdue|show overdue|read overdue|am i behind|anything overdue)\\b.*")) {
                JSONObject res = apiRequest("GET", "/tasks?view=overdue&limit=10", null);
                JSONArray tasks = res.optJSONArray("tasks");
                int count = tasks != null ? tasks.length() : 0;
                if (count == 0) {
                    return new CommandOutcome("Overdue Tasks", "Good news! You're completely caught up with no overdue tasks.", false, false);
                }
                return new CommandOutcome("Overdue Tasks", "You have " + count + " overdue tasks, including " + tasks.getJSONObject(0).optString("title") + ".", false, false);
            }

            if (lower.matches(".*\\b(what is due today|what's due today|what do i have today|what's on my plate|anything due today|today's tasks|read my day|show today tasks)\\b.*")) {
                JSONObject res = apiRequest("GET", "/tasks?view=today&limit=10", null);
                JSONArray tasks = res.optJSONArray("tasks");
                int count = tasks != null ? tasks.length() : 0;
                if (count == 0) {
                    return new CommandOutcome("My Day", "Your schedule is clear today! You have no tasks due today.", false, false);
                }
                return new CommandOutcome("My Day", "Today you have " + count + " tasks, starting with " + tasks.getJSONObject(0).optString("title") + ".", false, false);
            }

            if (lower.matches(".*\\b(upcoming tasks|what is upcoming|what's upcoming|show upcoming|read upcoming)\\b.*")) {
                JSONObject res = apiRequest("GET", "/tasks?view=upcoming&sortBy=dueDate&sortOrder=asc&limit=10", null);
                JSONArray tasks = res.optJSONArray("tasks");
                int count = tasks != null ? tasks.length() : 0;
                if (count == 0) {
                    return new CommandOutcome("Upcoming Tasks", "You have no upcoming scheduled tasks.", false, false);
                }
                return new CommandOutcome("Upcoming Tasks", "You have " + count + " upcoming tasks, starting with " + tasks.getJSONObject(0).optString("title") + ".", false, false);
            }

            if (lower.matches(".*\\b(mark all notifications read|clear notifications)\\b.*")) {
                apiRequest("POST", "/notifications/read-all", new JSONObject());
                return new CommandOutcome("Notifications Cleared", "All caught up! I marked your notifications as read.", true, false);
            }

            if (lower.matches(".*\\b(read notifications|check notifications|any notifications|show notifications)\\b.*")) {
                JSONObject res = apiRequest("GET", "/notifications", null);
                int unread = res.optInt("unreadCount", 0);
                if (unread == 0) {
                    return new CommandOutcome("Notifications", "You're all caught up with no unread notifications.", false, false);
                }
                JSONArray notifs = res.optJSONArray("notifications");
                String latest = (notifs != null && notifs.length() > 0) ? notifs.getJSONObject(0).optString("title", "") : "";
                return new CommandOutcome("Notifications", "You have " + unread + " unread notifications." + (latest.isEmpty() ? "" : " Latest: " + latest + "."), false, false);
            }

            if (lower.matches(".*\\b(what plan am i on|billing status|subscription status|current plan)\\b.*")) {
                JSONObject res = apiRequest("GET", "/billing/status", null);
                JSONObject sub = res.optJSONObject("subscription");
                String plan = sub != null ? sub.optString("planName", sub.optString("plan", "Free")) : res.optString("plan", "Free");
                return new CommandOutcome("Billing Status", "You are currently on the " + plan + " plan.", false, false);
            }

            if (lower.matches(".*\\b(check reminders|run reminders)\\b.*")) {
                apiRequest("POST", "/notifications/run-reminders", new JSONObject());
                return new CommandOutcome("Reminders Checked", "I've checked your task reminders.", true, false);
            }

            if (lower.matches(".*\\b(plan my day|organize my day|daily plan)\\b.*")) {
                JSONObject res = apiRequest("POST", "/v1/ai/optimize", new JSONObject().put("apply", false));
                JSONObject analysis = res.optJSONObject("analysis");
                JSONObject m = analysis != null ? analysis.optJSONObject("metrics") : null;
                if (m != null) {
                    String speech = String.format(
                        Locale.US,
                        "Here is your day. You have %d due today, %d overdue, and %d high priority tasks.",
                        m.optInt("dueTodayCount", 0), m.optInt("overdueCount", 0), m.optInt("highPriorityCount", 0)
                    );
                    return new CommandOutcome("Daily Plan", speech, false, false);
                }
                return new CommandOutcome("Daily Plan", "Your daily plan is ready.", false, false);
            }

            if (lower.matches(".*\\b(optimize schedule|balance schedule|apply schedule)\\b.*")) {
                JSONObject res = apiRequest("POST", "/v1/ai/optimize", new JSONObject().put("apply", true));
                int count = res.optInt("appliedCount", 0);
                String msg = count > 0 ? ("All done! I optimized your schedule and updated " + count + " tasks.") : "Your schedule already looks well balanced!";
                return new CommandOutcome("Schedule Optimized", msg, count > 0, false);
            }

            if (lower.matches("^(break\\s*down|plan project|create milestones(\\s+for)?)\\b.*")) {
                String goal = command.replaceFirst("(?i)^(break\\s*down|plan project|create milestones(\\s+for)?)\\s*(for\\s+)?", "").trim();
                JSONObject res = apiRequest("POST", "/v1/ai/breakdown", new JSONObject().put("goal", goal.isEmpty() ? "New Project" : goal).put("autoCreate", true));
                JSONArray tasks = res.optJSONArray("tasks");
                int count = tasks != null ? tasks.length() : 0;
                return new CommandOutcome("Project Milestones", "Done! I've created " + count + " milestones for " + goal + ".", true, false);
            }

            // 8. General AI Assistant Fallback (ask for clarification on short/unclear phrases)
            String[] words = command.trim().split("\\s+");
            if (words.length < 3 && !lower.matches(".*\\b(what|when|how|why|who|help|summary|tasks|schedule)\\b.*")) {
                return new CommandOutcome(
                    "Please Clarify",
                    "I didn't quite understand that. Could you explain what you'd like me to do?",
                    false,
                    false,
                    true,
                    null
                );
            }
            JSONObject chatRes = apiRequest("POST", "/v1/ai/chat", new JSONObject().put("message", command).put("source", "voice"));
            String reply = chatRes.optString("reply", "Done.").replaceAll("\\*\\*(.*?)\\*\\*", "$1").replaceAll("[#*`]", " ").trim();
            String action = chatRes.optString("action", "");
            boolean mutated = "task_created".equals(action) || "task_completed".equals(action) || "schedule_optimized".equals(action);
            if (chatRes.optJSONObject("task") != null) {
                lastReferencedTask = chatRes.optJSONObject("task");
            }
            return new CommandOutcome("TaskFlow Assistant", reply, mutated, false);
        } catch (Exception e) {
            return new CommandOutcome("TaskFlow Voice Error", e.getMessage() != null ? e.getMessage() : "Sorry, I couldn't complete that command.", false, false);
        }
    }

    private CommandOutcome completeTaskByQuery(String query) throws Exception {
        JSONObject task = resolveTaskReference(query, null);
        if (task == null) {
            return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + query + ".", false, false);
        }
        apiRequest("PATCH", "/tasks/" + task.getString("_id") + "/toggle", new JSONObject());
        lastReferencedTask = task;
        return new CommandOutcome("Task Completed", "Nice job! I've marked " + task.optString("title") + " as completed.", true, false);
    }

    private CommandOutcome startTaskByQuery(String query) throws Exception {
        JSONObject task = resolveTaskReference(query, null);
        if (task == null) {
            return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + query + ".", false, false);
        }
        apiRequest("PATCH", "/tasks/" + task.getString("_id") + "/status", new JSONObject().put("status", "in_progress"));
        lastReferencedTask = task;
        return new CommandOutcome("Task In Progress", "Got it! I moved " + task.optString("title") + " to in progress.", true, false);
    }

    private CommandOutcome editTaskByQuery(String query) throws Exception {
        JSONObject task = resolveTaskReference(query, null);
        if (task == null) {
            return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + query + ".", false, false);
        }
        lastReferencedTask = task;
        bringAppToFront();
        emitBroadcast(BROADCAST_UI_ACTION, "action", "open_edit_task", "target", task.getString("_id"));
        return new CommandOutcome("Edit Task", "Opening " + task.optString("title") + " so you can edit it.", false, false);
    }

    private CommandOutcome deleteTaskByQuery(String query) throws Exception {
        JSONObject task = resolveTaskReference(query, null);
        if (task == null) {
            return new CommandOutcome("Task Not Found", "Sorry, I couldn't find a task matching " + query + ".", false, false);
        }
        apiRequest("DELETE", "/tasks/" + task.getString("_id"), null);
        lastReferencedTask = task;
        return new CommandOutcome("Task Deleted", "Okay, I've moved " + task.optString("title") + " to the trash.", true, false);
    }

    private JSONObject resolveTaskReference(String query, String status) throws Exception {
        String clean = query != null ? query.trim() : "";
        if (lastReferencedTask != null && clean.toLowerCase(Locale.US).matches("^(it|that|that task|the task|this task|the last one|last one|this one)$")) {
            return lastReferencedTask;
        }
        return findMatchingTask(clean, status);
    }

    private JSONObject parseTaskPayload(String command) {
        try {
            JSONObject parsedRes = apiRequest("POST", "/v1/ai/parse", new JSONObject().put("prompt", command));
            JSONObject draft = parsedRes.optJSONObject("draft");
            if (draft != null && !draft.optString("title", "").isEmpty()) {
                draft.put("title", cleanSpokenTitle(draft.optString("title")));
                return draft;
            }
        } catch (Exception ignored) {
            // Fall back to local parser
        }
        return parseTaskLocally(command);
    }

    private String cleanSpokenTitle(String raw) {
        if (raw == null) return "New Voice Task";
        String cleaned = raw
            .replaceFirst("(?i)^(?:called|named|name|titled)\\s+", "")
            .replaceAll("^[\\s,:-]+|[\\s,:-]+$", "")
            .trim();
        if (cleaned.isEmpty()) return "New Voice Task";
        return Character.toUpperCase(cleaned.charAt(0)) + cleaned.substring(1);
    }

    private JSONObject parseTaskLocally(String command) {
        String lower = command.toLowerCase(Locale.US);
        String priority = "medium";
        if (lower.matches(".*\\b(urgent|critical|asap|high priority|important)\\b.*")) {
            priority = "high";
        } else if (lower.matches(".*\\b(low priority|whenever|optional)\\b.*")) {
            priority = "low";
        }

        Calendar cal = Calendar.getInstance();
        boolean hasDate = false;
        if (lower.contains("day after tomorrow")) {
            cal.add(Calendar.DAY_OF_YEAR, 2);
            hasDate = true;
        } else if (lower.contains("tomorrow")) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
            hasDate = true;
        } else if (lower.contains("today") || lower.contains("tonight")) {
            hasDate = true;
        } else if (lower.contains("next week")) {
            cal.add(Calendar.DAY_OF_YEAR, 7);
            hasDate = true;
        }

        String title = command
            .replaceFirst("(?i)^(?:i need to|i have to|i want to|i would like to|i gotta|help me|let'?s|don't let me forget to|remember to|put)\\s+", "")
            .replaceFirst("(?i)^(?:schedule|create|add|make|new|start|set up|remind me to|set reminder(?:\\s+to)?)\\s+(?:(?:a|an|the)\\s+)?(?:new\\s+)?(?:task\\s+)?(?:for\\s+me\\s+)?(?:called\\s+|named\\s+|name\\s+|titled\\s+|to\\s+)?", "")
            .replaceFirst("(?i)\\s+on my (?:task\\s+)?list$", "")
            .replaceAll("(?i)\\b(?:with\\s+)?(?:high|medium|low)\\s+priority\\b", "")
            .replaceAll("(?i)\\b(?:urgent|critical|asap)\\b", "")
            .replaceAll("(?i)\\b(?:for\\s+|on\\s+|by\\s+|in\\s+)?(?:day after tomorrow|tomorrow|tonight|today|next week)(?:\\s+(?:morning|afternoon|evening|night))?\\b", "")
            .replaceAll("(?i)\\b(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b", "")
            .replaceAll("\\s{2,}", " ")
            .trim();

        title = cleanSpokenTitle(title);

        JSONObject payload = new JSONObject();
        try {
            payload.put("title", title);
            payload.put("description", "Created via TaskFlow Background Voice: \"" + command + "\"");
            payload.put("priority", priority);
            payload.put("category", "General");
            if (hasDate) {
                SimpleDateFormat ymd = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                payload.put("dueDateString", ymd.format(cal.getTime()));
            }
        } catch (Exception ignored) {}
        return payload;
    }

    private CommandOutcome startTaskConversationInBackground(String command, String mode) {
        TaskDraft draft = new TaskDraft();
        draft.mode = mode;

        JSONObject parsed = parseTaskLocally(command);
        String rawTitle = parsed.optString("title", "");
        String lower = command == null ? "" : command.trim().toLowerCase(Locale.US);
        boolean bareCommand = lower.matches("^(?:(?:i\\s+(?:want|would\\s+like|need)\\s+to|help\\s+me|let'?s)\\s+)?(?:create|add|new|make|start|schedule)(?:\\s+(?:a|an|the))?(?:\\s+new)?\\s+task(?:\\s+for\\s+me)?$");

        if (!bareCommand && !rawTitle.isEmpty() && !"New Voice Task".equals(rawTitle)) {
            draft.title = rawTitle;
            draft.hasTitle = true;
        }
        String due = parsed.optString("dueDateString", "");
        if (!due.isEmpty() && !"null".equals(due)) {
            draft.dueDateString = due;
            draft.hasDueDate = true;
        }
        String extractedTime = extractTimeExpression(command);
        if (!extractedTime.isEmpty()) {
            draft.dueTime = extractedTime;
            if (!draft.hasDueDate) {
                draft.dueDateString = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
                draft.hasDueDate = true;
            }
        }
        if (lower.matches(".*\\b(urgent|critical|asap|high priority|important)\\b.*")) {
            draft.priority = "high";
            draft.hasPriority = true;
        } else if (lower.matches(".*\\b(medium priority|normal priority)\\b.*")) {
            draft.priority = "medium";
            draft.hasPriority = true;
        } else if (lower.matches(".*\\b(low priority|whenever|optional)\\b.*")) {
            draft.priority = "low";
            draft.hasPriority = true;
        }

        draft.step = determineNextDraftStep(draft);
        activeDraft = draft;
        isSubmittingDraft = false;
        return new CommandOutcome("New Task", buildDraftPrompt(draft), false, false, true, null);
    }

    private CommandOutcome advanceTaskConversationInBackground(String rawReply) throws Exception {
        TaskDraft draft = activeDraft;
        if (draft == null) {
            return new CommandOutcome("TaskFlow", "Let's start over. What task would you like to create?", false, false, true, null);
        }

        String trimmed = rawReply == null ? "" : rawReply.trim();
        String lower = trimmed.toLowerCase(Locale.US);

        if (trimmed.isEmpty()) {
            return new CommandOutcome("Please Repeat", "I didn't hear anything. " + buildDraftPrompt(draft), false, false, true, null);
        }

        if (lower.matches("^(?:cancel|stop|never mind|nevermind|forget it|abort|quit|exit|don't create|do not create)$")) {
            activeDraft = null;
            isSubmittingDraft = false;
            return new CommandOutcome("Cancelled", "Okay, I cancelled creating the task. Nothing was created.", false, false, false, null);
        }

        switch (draft.step) {
            case "ASK_TITLE": {
                if (lower.matches("^(?:yes|yeah|no|nope|ok|okay|um|uh|hmm)$")) {
                    return new CommandOutcome("Task Name", "I didn't catch the task name. What should I name the task?", false, false, true, null);
                }
                String cleaned = cleanSpokenTitle(
                    trimmed.replaceFirst("(?i)^(?:call it|name it|title is|task is|it is|it's|create|add)\\s+", "").trim()
                );
                if (cleaned.isEmpty() || "New Voice Task".equals(cleaned)) {
                    return new CommandOutcome("Task Name", "Could you tell me the name of the task?", false, false, true, null);
                }
                draft.title = cleaned;
                draft.hasTitle = true;
                draft.step = determineNextDraftStep(draft);
                return new CommandOutcome("Task Details", buildDraftPrompt(draft), false, false, true, null);
            }

            case "ASK_DUE_DATE": {
                if (lower.matches("^(?:no|none|no due date|skip|not needed|doesn't matter|anytime)$")) {
                    draft.dueDateSkipped = true;
                    draft.hasDueDate = false;
                    draft.dueDateString = "";
                    draft.dueTime = "";
                    draft.step = determineNextDraftStep(draft);
                    return new CommandOutcome("Task Details", buildDraftPrompt(draft), false, false, true, null);
                }
                String[] dateAndTime = parseDateAndTimeFromReply(trimmed);
                if (dateAndTime[0].isEmpty() && dateAndTime[1].isEmpty()) {
                    return new CommandOutcome("Due Date", "I didn't catch the date or time. When should I complete it? For example, tomorrow at 5 PM, or say no due date.", false, false, true, null);
                }
                draft.dueDateString = !dateAndTime[0].isEmpty()
                    ? dateAndTime[0]
                    : new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
                draft.dueTime = dateAndTime[1];
                draft.hasDueDate = true;
                draft.step = determineNextDraftStep(draft);
                return new CommandOutcome("Task Details", buildDraftPrompt(draft), false, false, true, null);
            }

            case "ASK_PRIORITY": {
                if (lower.matches(".*\\b(high|urgent|critical|asap|important)\\b.*")) {
                    draft.priority = "high";
                } else if (lower.matches(".*\\b(medium|normal|moderate|regular|default)\\b.*")) {
                    draft.priority = "medium";
                } else if (lower.matches(".*\\b(low|minor|whenever|optional)\\b.*")) {
                    draft.priority = "low";
                } else if (lower.matches("^(?:skip|none|default)$")) {
                    draft.priority = "medium";
                } else {
                    return new CommandOutcome("Priority", "I didn't catch the priority. Should it be high, medium, or low?", false, false, true, null);
                }
                draft.hasPriority = true;
                draft.step = determineNextDraftStep(draft);
                return new CommandOutcome("Task Details", buildDraftPrompt(draft), false, false, true, null);
            }

            case "ASK_EXTRA_DETAILS": {
                if (lower.matches("^(?:no|nope|nah|nothing|none|skip|done|that's all|thats all|confirm|go ahead|no thanks)$")) {
                    draft.extraDetailsDone = true;
                    draft.step = "CONFIRM";
                    return new CommandOutcome("Confirm Task", buildDraftPrompt(draft), false, false, true, null);
                }
                boolean updated = false;
                if (lower.startsWith("description ") || lower.startsWith("describe ")) {
                    draft.customDescription = trimmed.replaceFirst("(?i)^(?:description|describe)\\s+(?:is\\s+|as\\s+)?", "").trim();
                    updated = !draft.customDescription.isEmpty();
                } else if (lower.startsWith("category ")) {
                    String cat = trimmed.replaceFirst("(?i)^category\\s+(?:is\\s+|as\\s+)?", "").trim();
                    if (!cat.isEmpty()) {
                        draft.category = Character.toUpperCase(cat.charAt(0)) + cat.substring(1);
                        updated = true;
                    }
                } else if (lower.startsWith("subtask ") || lower.startsWith("add subtask ")) {
                    String sub = trimmed.replaceFirst("(?i)^(?:add\\s+)?subtask\\s+", "").trim();
                    if (!sub.isEmpty()) {
                        draft.subtasks.add(Character.toUpperCase(sub.charAt(0)) + sub.substring(1));
                        updated = true;
                    }
                } else if (lower.startsWith("assign to ") || lower.startsWith("assignee ")) {
                    String who = trimmed.replaceFirst("(?i)^(?:assign to|assignee)\\s+", "").trim();
                    if (!who.isEmpty()) {
                        draft.assigneeName = who;
                        updated = true;
                    }
                }

                if (!updated) {
                    return new CommandOutcome(
                        "Extra Details",
                        "I didn't catch that detail. You can say description, category, subtask, or say no to review and confirm.",
                        false,
                        false,
                        true,
                        null
                    );
                }
                return new CommandOutcome(
                    "Detail Added",
                    "Got it, I added that. Any other details, or say no to review and confirm?",
                    false,
                    false,
                    true,
                    null
                );
            }

            case "CONFIRM": {
                if (lower.matches("^(?:yes|yeah|yep|yup|sure|confirm|create it|schedule it|go ahead|do it|ok|okay|sounds good|please do|affirmative|correct)$")) {
                    if (isSubmittingDraft) {
                        return new CommandOutcome("Creating Task", "I'm already creating that task.", false, false, false, null);
                    }
                    isSubmittingDraft = true;
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("title", draft.title);
                        String desc = !draft.customDescription.isEmpty()
                            ? draft.customDescription
                            : ("Created via TaskFlow Background Voice" + (!draft.dueTime.isEmpty() ? (" (" + draft.dueTime + ")") : ""));
                        payload.put("description", desc);
                        payload.put("priority", draft.hasPriority ? draft.priority : "medium");
                        payload.put("category", draft.category);
                        if (draft.hasDueDate && !draft.dueDateString.isEmpty()) {
                            payload.put("dueDateString", draft.dueDateString);
                        }
                        JSONObject res = apiRequest("POST", "/tasks", payload);
                        JSONObject created = res.optJSONObject("task");
                        if (created != null) {
                            lastReferencedTask = created;
                            String taskId = created.optString("_id", "");
                            if (!taskId.isEmpty() && !draft.subtasks.isEmpty()) {
                                for (String subTitle : draft.subtasks) {
                                    try {
                                        apiRequest("POST", "/tasks/" + taskId + "/subtasks", new JSONObject().put("title", subTitle));
                                    } catch (Exception ignored) {}
                                }
                            }
                        }
                        String notifTitle = "schedule".equals(draft.mode) ? "Task Scheduled" : "Task Created";
                        String speech = "schedule".equals(draft.mode)
                            ? "Your task has been scheduled successfully."
                            : "Your task has been created successfully.";
                        activeDraft = null;
                        return new CommandOutcome(notifTitle, speech, true, false, false, null);
                    } finally {
                        isSubmittingDraft = false;
                    }
                }

                if (lower.matches("^(?:no|nope|nah|don't|do not|dont)$")) {
                    activeDraft = null;
                    isSubmittingDraft = false;
                    return new CommandOutcome("Cancelled", "Okay, I didn't create the task.", false, false, false, null);
                }

                if (lower.matches("^(?:change|set|make)\\s+(?:the\\s+)?priority\\s+(?:to\\s+)?(?:high|medium|low)$")) {
                    if (lower.contains("high")) draft.priority = "high";
                    else if (lower.contains("low")) draft.priority = "low";
                    else draft.priority = "medium";
                    draft.hasPriority = true;
                    return new CommandOutcome("Confirm Task", buildDraftPrompt(draft), false, false, true, null);
                }

                return new CommandOutcome(
                    "Confirm Task",
                    "I didn't catch a clear confirmation. " + formatDraftReadback(draft) + " Please say yes to create it, or cancel to stop.",
                    false,
                    false,
                    true,
                    null
                );
            }

            default:
                activeDraft = null;
                return new CommandOutcome("TaskFlow", "Let's start over. What task would you like to create?", false, false, true, null);
        }
    }

    private String determineNextDraftStep(TaskDraft d) {
        if (!d.hasTitle) return "ASK_TITLE";
        if (!d.hasDueDate && !d.dueDateSkipped) return "ASK_DUE_DATE";
        if (!d.hasPriority) return "ASK_PRIORITY";
        if (!d.extraDetailsDone) return "ASK_EXTRA_DETAILS";
        return "CONFIRM";
    }

    private String buildDraftPrompt(TaskDraft d) {
        switch (d.step) {
            case "ASK_TITLE":
                return "Sure! What should I name the task?";
            case "ASK_DUE_DATE":
                return "When should I complete it?";
            case "ASK_PRIORITY":
                return "What priority should I set? High, medium, or low?";
            case "ASK_EXTRA_DETAILS":
                return "Would you like to add any extra details like a description, category, or subtasks? Or say no to review and confirm.";
            case "CONFIRM":
            default:
                return formatDraftReadback(d) + ("schedule".equals(d.mode) ? " Should I schedule it?" : " Should I create it?");
        }
    }

    private String formatDraftReadback(TaskDraft d) {
        StringBuilder sb = new StringBuilder();
        sb.append("Your task is '").append(d.title).append("'");
        if (d.hasDueDate && !d.dueDateString.isEmpty()) {
            String humanDate = formatHumanDate(d.dueDateString);
            sb.append(", due ").append(humanDate.isEmpty() ? d.dueDateString : humanDate);
            if (!d.dueTime.isEmpty()) {
                sb.append(" at ").append(d.dueTime);
            }
        } else {
            sb.append(", with no due date");
        }
        String prio = d.hasPriority ? d.priority : "medium";
        sb.append(", with ").append(prio).append(" priority");
        if (!"General".equalsIgnoreCase(d.category)) {
            sb.append(", in ").append(d.category).append(" category");
        }
        if (!d.assigneeName.isEmpty()) {
            sb.append(", assigned to ").append(d.assigneeName);
        }
        if (!d.subtasks.isEmpty()) {
            sb.append(", with ").append(d.subtasks.size()).append(d.subtasks.size() == 1 ? " subtask" : " subtasks");
        }
        if (!d.customDescription.isEmpty()) {
            sb.append(", description: ").append(d.customDescription);
        }
        sb.append(".");
        return sb.toString();
    }

    private String extractTimeExpression(String text) {
        if (text == null) return "";
        Matcher m = Pattern.compile("\\b(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) {
            String hr = m.group(1);
            String min = m.group(2) != null ? m.group(2) : "00";
            String ampm = m.group(3).toUpperCase(Locale.US);
            return hr + ("00".equals(min) ? "" : (":" + min)) + " " + ampm;
        }
        return "";
    }

    private String[] parseDateAndTimeFromReply(String reply) {
        String lower = reply.toLowerCase(Locale.US);
        Calendar cal = Calendar.getInstance();
        boolean hasDate = false;
        if (lower.contains("day after tomorrow")) {
            cal.add(Calendar.DAY_OF_YEAR, 2);
            hasDate = true;
        } else if (lower.contains("tomorrow")) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
            hasDate = true;
        } else if (lower.contains("today") || lower.contains("tonight")) {
            hasDate = true;
        } else if (lower.contains("next week")) {
            cal.add(Calendar.DAY_OF_YEAR, 7);
            hasDate = true;
        } else {
            String[] days = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"};
            for (int i = 0; i < days.length; i++) {
                if (lower.contains(days[i])) {
                    int target = i + 1; // Calendar.SUNDAY is 1
                    int current = cal.get(Calendar.DAY_OF_WEEK);
                    int diff = (target - current + 7) % 7;
                    if (diff == 0) diff = 7;
                    cal.add(Calendar.DAY_OF_YEAR, diff);
                    hasDate = true;
                    break;
                }
            }
        }
        String timeStr = extractTimeExpression(reply);
        String dateStr = hasDate ? new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime()) : "";
        return new String[] { dateStr, timeStr };
    }

    private JSONObject findMatchingTask(String query, String status) throws Exception {
        StringBuilder path = new StringBuilder("/tasks?limit=30");
        if (query != null && !query.isEmpty()) {
            path.append("&search=").append(URLEncoder.encode(query, "UTF-8"));
        }
        if (status != null && !status.isEmpty()) {
            path.append("&status=").append(URLEncoder.encode(status, "UTF-8"));
        }
        JSONObject res = apiRequest("GET", path.toString(), null);
        JSONObject match = pickBestTask(res.optJSONArray("tasks"), query);
        if (match == null && query != null && !query.isEmpty()) {
            JSONObject allRes = apiRequest("GET", "/tasks?limit=50", null);
            match = pickBestTask(allRes.optJSONArray("tasks"), query);
        }
        return match;
    }

    private JSONObject pickBestSubtask(JSONArray subtasks, String query) {
        if (subtasks == null || subtasks.length() == 0) return null;
        if (query == null || query.trim().isEmpty()) return subtasks.optJSONObject(0);
        String q = query.trim().toLowerCase(Locale.US);
        for (int i = 0; i < subtasks.length(); i++) {
            JSONObject s = subtasks.optJSONObject(i);
            if (s != null && s.optString("title", "").toLowerCase(Locale.US).equals(q)) {
                return s;
            }
        }
        for (int i = 0; i < subtasks.length(); i++) {
            JSONObject s = subtasks.optJSONObject(i);
            if (s != null && s.optString("title", "").toLowerCase(Locale.US).contains(q)) {
                return s;
            }
        }
        return null;
    }

    private JSONObject pickBestTask(JSONArray tasks, String query) {
        if (tasks == null || tasks.length() == 0) return null;
        if (query == null || query.trim().isEmpty()) return tasks.optJSONObject(0);
        String q = query.trim().toLowerCase(Locale.US);
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t != null && t.optString("title", "").toLowerCase(Locale.US).equals(q)) {
                return t;
            }
        }
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t != null && t.optString("title", "").toLowerCase(Locale.US).contains(q)) {
                return t;
            }
        }
        return null;
    }

    private JSONObject apiRequest(String method, String path, JSONObject body) throws Exception {
        return apiRequestInternal(method, path, body, true);
    }

    private JSONObject apiRequestInternal(String method, String path, JSONObject body, boolean allowRefresh) throws Exception {
        String baseUrl = VoiceSessionStore.getBaseUrl(this);
        URL url = new URL(baseUrl + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(12000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("x-timezone", VoiceSessionStore.getTimezone(this));

        String token = VoiceSessionStore.getToken(this);
        if (!token.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + token);
        }
        String orgId = VoiceSessionStore.getOrgId(this);
        if (!orgId.isEmpty()) {
            conn.setRequestProperty("x-organization-id", orgId);
        }
        String wsId = VoiceSessionStore.getWorkspaceId(this);
        if (!wsId.isEmpty()) {
            conn.setRequestProperty("x-workspace-id", wsId);
        }

        if (body != null && ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method))) {
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }

        int status = conn.getResponseCode();
        InputStream stream = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
        StringBuilder sb = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
        }
        conn.disconnect();

        if (status == 401 && allowRefresh && attemptTokenRefresh()) {
            return apiRequestInternal(method, path, body, false);
        }

        JSONObject json = sb.length() > 0 ? new JSONObject(sb.toString()) : new JSONObject();
        if (status < 200 || status >= 300) {
            throw new Exception(json.optString("message", "Server returned error " + status));
        }
        return json;
    }

    private boolean attemptTokenRefresh() {
        String refreshToken = VoiceSessionStore.getRefreshToken(this);
        if (refreshToken == null || refreshToken.isEmpty()) return false;
        try {
            String baseUrl = VoiceSessionStore.getBaseUrl(this);
            URL url = new URL(baseUrl + "/auth/refresh");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-refresh-token", refreshToken);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(new JSONObject().put("refreshToken", refreshToken).toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = conn.getResponseCode();
            if (status >= 200 && status < 300) {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                }
                JSONObject json = new JSONObject(sb.toString());
                if (json.optBoolean("success", false)) {
                    String newToken = json.optString("token", "");
                    String newRefresh = json.optString("refreshToken", "");
                    VoiceSessionStore.updateTokens(this, newToken, newRefresh);
                    emitBroadcast(BROADCAST_TOKENS_UPDATED, "token", newToken, "refreshToken", newRefresh);
                    conn.disconnect();
                    return true;
                }
            }
            conn.disconnect();
        } catch (Exception ignored) {}
        return false;
    }

    private void emitBroadcast(String action, String key, String value) {
        Intent intent = new Intent(action);
        intent.setPackage(getPackageName());
        intent.putExtra(key, value);
        sendBroadcast(intent);
    }

    private void emitBroadcast(String action, String k1, String v1, String k2, String v2) {
        Intent intent = new Intent(action);
        intent.setPackage(getPackageName());
        intent.putExtra(k1, v1);
        intent.putExtra(k2, v2);
        sendBroadcast(intent);
    }

    @Override
    public void onDestroy() {
        isServiceRunning = false;
        cancelTtsSafety();
        cancelAwakeWindow();
        stopVoskEngine();
        abandonAudioFocus();
        if (textToSpeech != null) {
            try {
                textToSpeech.stop();
                textToSpeech.shutdown();
            } catch (Exception ignored) {}
            textToSpeech = null;
        }
        executor.shutdownNow();
        super.onDestroy();
    }
}
