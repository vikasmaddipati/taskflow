package com.taskflow.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(
    name = "VoiceBridge",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class VoiceBridgePlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private boolean ttsInitializing = false;
    private String pendingSpeechText = null;
    private boolean isListening = false;
    private boolean continuousMode = false;
    private boolean isSpeaking = false;
    private String activeLanguage = resolveDefaultLanguage();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingRestartRunnable;
    private BroadcastReceiver serviceReceiver;

    private static String resolveDefaultLanguage() {
        String tag = Locale.getDefault().toLanguageTag();
        return (tag != null && !tag.isEmpty() && !"und".equals(tag)) ? tag : "en-IN";
    }

    private static String resolveLanguageTag(String requested) {
        if (requested == null || requested.trim().isEmpty() || "auto".equalsIgnoreCase(requested.trim())) {
            return resolveDefaultLanguage();
        }
        return requested.trim();
    }

    @Override
    public void load() {
        super.load();
        initTextToSpeech();
        registerServiceReceiver();
    }

    private void registerServiceReceiver() {
        if (serviceReceiver != null) return;
        serviceReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || intent.getAction() == null) return;
                String action = intent.getAction();
                if (VoiceCommandForegroundService.BROADCAST_STATE.equals(action)) {
                    JSObject data = new JSObject();
                    String state = intent.getStringExtra("state");
                    isListening = "listening".equals(state);
                    data.put("state", state != null ? state : "idle");
                    String msg = intent.getStringExtra("message");
                    if (msg != null) data.put("message", msg);
                    notifyListeners("voiceState", data);
                } else if (VoiceCommandForegroundService.BROADCAST_PARTIAL.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("text", intent.getStringExtra("text"));
                    notifyListeners("voicePartial", data);
                } else if (VoiceCommandForegroundService.BROADCAST_RESULT.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("text", intent.getStringExtra("text"));
                    notifyListeners("backgroundVoiceResult", data);
                } else if (VoiceCommandForegroundService.BROADCAST_RESPONSE.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("text", intent.getStringExtra("text"));
                    notifyListeners("backgroundVoiceResponse", data);
                } else if (VoiceCommandForegroundService.BROADCAST_DATA_UPDATED.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("action", intent.getStringExtra("action"));
                    notifyListeners("voiceDataUpdated", data);
                } else if (VoiceCommandForegroundService.BROADCAST_UI_ACTION.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("action", intent.getStringExtra("action"));
                    data.put("target", intent.getStringExtra("target"));
                    notifyListeners("voiceUiAction", data);
                } else if (VoiceCommandForegroundService.BROADCAST_TOKENS_UPDATED.equals(action)) {
                    JSObject data = new JSObject();
                    data.put("token", intent.getStringExtra("token"));
                    data.put("refreshToken", intent.getStringExtra("refreshToken"));
                    notifyListeners("voiceTokensUpdated", data);
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(VoiceCommandForegroundService.BROADCAST_STATE);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_PARTIAL);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_RESULT);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_RESPONSE);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_DATA_UPDATED);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_UI_ACTION);
        filter.addAction(VoiceCommandForegroundService.BROADCAST_TOKENS_UPDATED);
        ContextCompat.registerReceiver(getContext(), serviceReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void initTextToSpeech() {
        if (textToSpeech != null || ttsInitializing) return;
        ttsInitializing = true;
        textToSpeech = new TextToSpeech(getContext().getApplicationContext(), status -> {
            ttsInitializing = false;
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = selectBestTtsLanguage(textToSpeech);
                textToSpeech.setSpeechRate(1.0f);
                textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        isSpeaking = true;
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        isSpeaking = false;
                        mainHandler.post(() -> {
                            emitTtsDone(utteranceId);
                            if (continuousMode && !isListening && !VoiceCommandForegroundService.isServiceRunning) {
                                scheduleRestartListening(250);
                            }
                        });
                    }

                    @Override
                    public void onError(String utteranceId) {
                        isSpeaking = false;
                        mainHandler.post(() -> {
                            emitTtsDone(utteranceId);
                            if (continuousMode && !isListening && !VoiceCommandForegroundService.isServiceRunning) {
                                scheduleRestartListening(350);
                            }
                        });
                    }
                });

                if (pendingSpeechText != null) {
                    String queued = pendingSpeechText;
                    pendingSpeechText = null;
                    mainHandler.post(() -> speakInternal(queued));
                }
            } else {
                ttsReady = false;
                if (pendingSpeechText != null) {
                    pendingSpeechText = null;
                    mainHandler.post(() -> emitTtsDone("unavailable"));
                }
            }
        });
    }

    static boolean selectBestTtsLanguage(TextToSpeech tts) {
        Locale[] candidates = new Locale[] { Locale.getDefault(), Locale.US, Locale.UK, Locale.ENGLISH };
        boolean langSet = false;
        for (Locale loc : candidates) {
            if (loc == null) continue;
            int res = tts.setLanguage(loc);
            if (res >= TextToSpeech.LANG_AVAILABLE) {
                langSet = true;
                break;
            }
        }
        try {
            Voice bestVoice = null;
            int bestScore = -1;
            if (tts.getVoices() != null) {
                String defaultLang = Locale.getDefault().getLanguage();
                for (Voice v : tts.getVoices()) {
                    if (v == null || v.getLocale() == null) continue;
                    if (!"en".equalsIgnoreCase(v.getLocale().getLanguage()) && !v.getLocale().getLanguage().equalsIgnoreCase(defaultLang)) {
                        continue;
                    }
                    int score = v.getQuality();
                    String name = v.getName() != null ? v.getName().toLowerCase(Locale.US) : "";
                    if (name.contains("network") || name.contains("neural") || name.contains("natural") || name.contains("-x-")) {
                        score += 150;
                    }
                    if (!v.isNetworkConnectionRequired()) {
                        score += 50;
                    }
                    if (Locale.getDefault().getCountry().equalsIgnoreCase(v.getLocale().getCountry())) {
                        score += 80;
                    }
                    if (score > bestScore) {
                        bestScore = score;
                        bestVoice = v;
                    }
                }
            }
            if (bestVoice != null) {
                tts.setVoice(bestVoice);
                tts.setPitch(1.02f);
                tts.setSpeechRate(1.03f);
                return true;
            }
        } catch (Exception ignored) {}
        return langSet;
    }

    private void emitTtsDone(String utteranceId) {
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);
        notifyListeners("ttsDone", data);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        mainHandler.post(() -> {
            boolean sttAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
            JSObject ret = new JSObject();
            ret.put("sttAvailable", sttAvailable);
            ret.put("ttsAvailable", ttsReady || textToSpeech != null);
            ret.put("backgroundSupported", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void syncSession(PluginCall call) {
        VoiceSessionStore.save(
            getContext(),
            call.getString("baseUrl", ""),
            call.getString("token", ""),
            call.getString("refreshToken", ""),
            call.getString("orgId", ""),
            call.getString("workspaceId", ""),
            call.getString("timezone", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void getSyncedSession(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("baseUrl", VoiceSessionStore.getBaseUrl(getContext()));
        ret.put("token", VoiceSessionStore.getToken(getContext()));
        ret.put("refreshToken", VoiceSessionStore.getRefreshToken(getContext()));
        ret.put("orgId", VoiceSessionStore.getOrgId(getContext()));
        ret.put("workspaceId", VoiceSessionStore.getWorkspaceId(getContext()));
        ret.put("timezone", VoiceSessionStore.getTimezone(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        boolean wasRunning = VoiceCommandForegroundService.isServiceRunning;
        VoiceSessionStore.clear(getContext());
        stopServiceInternal();
        if (wasRunning) {
            emitState("stopped", null);
        }
        call.resolve();
    }

    @PluginMethod
    public void startBackgroundVoice(PluginCall call) {
        activeLanguage = resolveLanguageTag(call.getString("language", null));

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "bgMicPermissionCallback");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "bgNotificationPermissionCallback");
            return;
        }

        launchBackgroundService(call);
    }

    @PermissionCallback
    private void bgMicPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            emitState("error", "Microphone permission is required for background voice commands.");
            call.reject("Microphone permission denied.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "bgNotificationPermissionCallback");
            return;
        }
        launchBackgroundService(call);
    }

    @PermissionCallback
    private void bgNotificationPermissionCallback(PluginCall call) {
        launchBackgroundService(call);
    }

    private void launchBackgroundService(PluginCall call) {
        mainHandler.post(() -> {
            continuousMode = false;
            cancelPendingRestart();
            destroyRecognizer();

            Intent intent = new Intent(getContext(), VoiceCommandForegroundService.class);
            intent.setAction(VoiceCommandForegroundService.ACTION_START);
            intent.putExtra(VoiceCommandForegroundService.EXTRA_LANGUAGE, activeLanguage);
            ContextCompat.startForegroundService(getContext(), intent);

            JSObject ret = new JSObject();
            ret.put("running", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void stopBackgroundVoice(PluginCall call) {
        mainHandler.post(() -> {
            stopServiceInternal();
            emitState("stopped", null);
            call.resolve();
        });
    }

    @PluginMethod
    public void isBackgroundVoiceRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", VoiceCommandForegroundService.isServiceRunning);
        call.resolve(ret);
    }

    private void stopServiceInternal() {
        try {
            Intent intent = new Intent(getContext(), VoiceCommandForegroundService.class);
            intent.setAction(VoiceCommandForegroundService.ACTION_STOP);
            getContext().stopService(intent);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (VoiceCommandForegroundService.isServiceRunning) {
            emitState("listening", null);
            call.resolve();
            return;
        }

        continuousMode = Boolean.TRUE.equals(call.getBoolean("continuous", false));
        activeLanguage = resolveLanguageTag(call.getString("language", null));

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }

        mainHandler.post(() -> {
            boolean started = beginRecognitionSession();
            if (started) {
                call.resolve();
            } else {
                call.reject("Speech recognition is not available on this device.");
            }
        });
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            mainHandler.post(() -> {
                boolean started = beginRecognitionSession();
                if (started) {
                    call.resolve();
                } else {
                    call.reject("Speech recognition is not available on this device.");
                }
            });
        } else {
            continuousMode = false;
            emitState("error", "Microphone permission is required for voice commands.");
            call.reject("Microphone permission denied.");
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        continuousMode = false;
        mainHandler.post(() -> {
            cancelPendingRestart();
            destroyRecognizer();
            if (!VoiceCommandForegroundService.isServiceRunning) {
                emitState("idle", null);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            emitTtsDone("empty");
            call.resolve();
            return;
        }

        if (textToSpeech == null) {
            pendingSpeechText = text;
            initTextToSpeech();
            call.resolve();
            return;
        }

        mainHandler.post(() -> {
            if (ttsInitializing) {
                pendingSpeechText = text;
                call.resolve();
                return;
            }
            if (!ttsReady) {
                emitTtsDone("unavailable");
                call.resolve();
                return;
            }
            String utteranceId = speakInternal(text);
            JSObject ret = new JSObject();
            ret.put("utteranceId", utteranceId);
            call.resolve(ret);
        });
    }

    private String speakInternal(String text) {
        if (isListening) {
            cancelPendingRestart();
            destroyRecognizer();
            emitState("speaking", null);
        }
        isSpeaking = true;
        String utteranceId = UUID.randomUUID().toString();
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result == TextToSpeech.ERROR) {
            isSpeaking = false;
            emitTtsDone(utteranceId);
        }
        return utteranceId;
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        mainHandler.post(() -> {
            pendingSpeechText = null;
            if (textToSpeech != null) {
                textToSpeech.stop();
            }
            isSpeaking = false;
            call.resolve();
        });
    }

    private boolean beginRecognitionSession() {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            emitState("error", "Speech recognition service is not available on this device. Install or enable Google Speech Services.");
            return false;
        }

        cancelPendingRestart();
        destroyRecognizer();

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                isListening = true;
                emitState("listening", null);
            }

            @Override
            public void onBeginningOfSpeech() {}

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                isListening = false;
            }

            @Override
            public void onError(int error) {
                isListening = false;
                boolean recoverable =
                    error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ||
                    error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;

                if (continuousMode && recoverable && !isSpeaking) {
                    scheduleRestartListening(error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 700 : 300);
                    return;
                }

                String message = mapSpeechError(error);
                if (!recoverable) {
                    continuousMode = false;
                }

                JSObject errData = new JSObject();
                errData.put("code", error);
                errData.put("message", message);
                notifyListeners("voiceError", errData);
                emitState("error", message);
            }

            @Override
            public void onResults(Bundle results) {
                isListening = false;
                ArrayList<String> matches = results != null
                    ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;

                if (matches != null && !matches.isEmpty()) {
                    JSObject resData = new JSObject();
                    resData.put("text", matches.get(0));
                    JSArray arr = new JSArray();
                    for (String m : matches) {
                        arr.put(m);
                    }
                    resData.put("matches", arr);
                    notifyListeners("voiceResult", resData);
                }

                if (continuousMode && !isSpeaking) {
                    scheduleRestartListening(400);
                } else if (!isSpeaking) {
                    emitState("idle", null);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults != null
                    ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;
                if (matches != null && !matches.isEmpty()) {
                    JSObject partialData = new JSObject();
                    partialData.put("text", matches.get(0));
                    notifyListeners("voicePartial", partialData);
                }
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, activeLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, activeLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);

        speechRecognizer.startListening(intent);
        isListening = true;
        emitState("listening", null);
        return true;
    }

    private void scheduleRestartListening(long delayMs) {
        cancelPendingRestart();
        pendingRestartRunnable = () -> {
            if (continuousMode && !isSpeaking && !VoiceCommandForegroundService.isServiceRunning) {
                beginRecognitionSession();
            }
        };
        mainHandler.postDelayed(pendingRestartRunnable, delayMs);
    }

    private void cancelPendingRestart() {
        if (pendingRestartRunnable != null) {
            mainHandler.removeCallbacks(pendingRestartRunnable);
            pendingRestartRunnable = null;
        }
    }

    private void destroyRecognizer() {
        isListening = false;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
    }

    private void emitState(String state, String message) {
        JSObject data = new JSObject();
        data.put("state", state);
        if (message != null) {
            data.put("message", message);
        }
        notifyListeners("voiceState", data);
    }

    private String mapSpeechError(int error) {
        return switch (error) {
            case SpeechRecognizer.ERROR_AUDIO -> "Audio recording error. Check microphone access.";
            case SpeechRecognizer.ERROR_CLIENT -> "Speech recognizer client error. Try tapping the mic again.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required.";
            case SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network error during speech recognition.";
            case SpeechRecognizer.ERROR_NO_MATCH -> "Did not catch that. Tap mic and speak clearly.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer is busy. Try again.";
            case SpeechRecognizer.ERROR_SERVER -> "Speech server error.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected. Tap mic and speak.";
            default -> "Speech recognition error (" + error + ").";
        };
    }

    @Override
    protected void handleOnDestroy() {
        continuousMode = false;
        cancelPendingRestart();
        destroyRecognizer();
        if (serviceReceiver != null) {
            try {
                getContext().unregisterReceiver(serviceReceiver);
            } catch (Exception ignored) {}
            serviceReceiver = null;
        }
        if (textToSpeech != null) {
            try {
                textToSpeech.stop();
                textToSpeech.shutdown();
            } catch (Exception ignored) {}
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
