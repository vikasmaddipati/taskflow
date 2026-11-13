import { Capacitor, registerPlugin } from '@capacitor/core';

const VoiceBridge = Capacitor.isNativePlatform() ? registerPlugin('VoiceBridge') : null;

const getWebSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const getDefaultRecognitionLanguage = () =>
  (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

export const stripForSpeech = (text = '') =>
  String(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/[#_~>]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isVoiceSupported = () => {
  if (Capacitor.isNativePlatform()) return true;
  return Boolean(getWebSpeechRecognition());
};

export const isSpeechOutputSupported = () => {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
};

class VoiceService {
  constructor() {
    this.recognition = null;
    this.nativeHandles = [];
    this.isContinuous = false;
    this.isSpeaking = false;
    this.isListening = false;
    this.callbacks = {};
    this.webRestartTimer = null;
  }

  async checkAvailability() {
    if (VoiceBridge) {
      try {
        return await VoiceBridge.isAvailable();
      } catch {
        return { sttAvailable: false, ttsAvailable: false };
      }
    }
    return {
      sttAvailable: Boolean(getWebSpeechRecognition()),
      ttsAvailable: isSpeechOutputSupported()
    };
  }

  async attachNativeListeners() {
    if (!VoiceBridge || this.nativeHandles.length > 0) return;

    this.nativeHandles.push(
      await VoiceBridge.addListener('voiceState', (data) => {
        this.isListening = data?.state === 'listening';
        this.callbacks.onState?.(data?.state || 'idle', data?.message || null);
      }),
      await VoiceBridge.addListener('voicePartial', (data) => {
        if (data?.text) this.callbacks.onPartial?.(data.text);
      }),
      await VoiceBridge.addListener('voiceResult', (data) => {
        if (data?.text) this.callbacks.onResult?.(data.text, data.matches || [data.text]);
      }),
      await VoiceBridge.addListener('backgroundVoiceResult', (data) => {
        if (data?.text) this.callbacks.onBackgroundResult?.(data.text);
      }),
      await VoiceBridge.addListener('backgroundVoiceResponse', (data) => {
        if (data?.text) this.callbacks.onBackgroundResponse?.(data.text);
      }),
      await VoiceBridge.addListener('voiceDataUpdated', (data) => {
        this.callbacks.onDataUpdated?.(data?.action || null);
      }),
      await VoiceBridge.addListener('voiceUiAction', (data) => {
        this.callbacks.onUiAction?.(data?.action || null, data?.target || null);
      }),
      await VoiceBridge.addListener('voiceTokensUpdated', (data) => {
        this.callbacks.onTokensUpdated?.(data);
      }),
      await VoiceBridge.addListener('voiceError', (data) => {
        this.callbacks.onError?.(data?.message || 'Voice recognition error');
      })
    );
  }

  isBackgroundSupported() {
    return Boolean(VoiceBridge);
  }

  async syncSession(session) {
    if (!VoiceBridge) return;
    try {
      await VoiceBridge.syncSession(session);
    } catch {
      // ignore
    }
  }

  async clearSession() {
    if (!VoiceBridge) return;
    try {
      await VoiceBridge.clearSession();
    } catch {
      // ignore
    }
  }

  async getSyncedSession() {
    if (!VoiceBridge) return null;
    try {
      return await VoiceBridge.getSyncedSession();
    } catch {
      return null;
    }
  }

  async startBackgroundVoice({
    language = getDefaultRecognitionLanguage(),
    onState,
    onPartial,
    onBackgroundResult,
    onBackgroundResponse,
    onDataUpdated,
    onUiAction,
    onTokensUpdated,
    onError
  } = {}) {
    if (!VoiceBridge) return false;
    this.callbacks = {
      ...this.callbacks,
      onState,
      onPartial,
      onBackgroundResult,
      onBackgroundResponse,
      onDataUpdated,
      onUiAction,
      onTokensUpdated,
      onError
    };
    this.isContinuous = true;
    await this.attachNativeListeners();
    try {
      await VoiceBridge.startBackgroundVoice({ language });
      return true;
    } catch (err) {
      this.isContinuous = false;
      const msg = err?.message || 'Unable to start background voice service';
      onState?.('error', msg);
      onError?.(msg);
      return false;
    }
  }

  async stopBackgroundVoice() {
    this.isContinuous = false;
    if (!VoiceBridge) return;
    try {
      await VoiceBridge.stopBackgroundVoice();
    } catch {
      // ignore
    }
  }

  async isBackgroundVoiceRunning() {
    if (!VoiceBridge) return false;
    try {
      const res = await VoiceBridge.isBackgroundVoiceRunning();
      return Boolean(res?.running);
    } catch {
      return false;
    }
  }

  async startListening({ continuous = false, language = getDefaultRecognitionLanguage(), onState, onPartial, onResult, onError } = {}) {
    this.callbacks = { onState, onPartial, onResult, onError };
    this.isContinuous = Boolean(continuous);

    if (VoiceBridge) {
      await this.attachNativeListeners();
      try {
        await VoiceBridge.startListening({ continuous: this.isContinuous, language });
        return true;
      } catch (err) {
        this.isContinuous = false;
        const msg = err?.message || 'Unable to start voice recognition';
        onState?.('error', msg);
        onError?.(msg);
        return false;
      }
    }

    const SpeechRecognition = getWebSpeechRecognition();
    if (!SpeechRecognition) {
      const msg = 'Voice recognition is not supported in this browser.';
      onState?.('error', msg);
      onError?.(msg);
      return false;
    }

    this.stopWebRecognizer();
    this.startWebRecognizer(SpeechRecognition, language);
    return true;
  }

  startWebRecognizer(SpeechRecognition, language = getDefaultRecognitionLanguage()) {
    if (this.isSpeaking) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = this.isContinuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      this.isListening = true;
      this.callbacks.onState?.('listening', null);
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || '';
        if (res.isFinal) {
          const matches = Array.from(res).map((alt) => alt.transcript).filter(Boolean);
          this.callbacks.onResult?.(transcript.trim(), matches);
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) {
        this.callbacks.onPartial?.(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      const errCode = event?.error;
      if (errCode === 'aborted') return;
      if (this.isContinuous && (errCode === 'no-speech' || errCode === 'network')) {
        return;
      }
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        this.isContinuous = false;
        const msg = 'Microphone permission denied.';
        this.callbacks.onState?.('error', msg);
        this.callbacks.onError?.(msg);
        return;
      }
      if (!this.isContinuous && errCode === 'no-speech') {
        this.callbacks.onState?.('idle', null);
        return;
      }
      this.callbacks.onError?.(`Voice recognition error: ${errCode}`);
    };

    recognition.onend = () => {
      this.isListening = false;
      if (this.isContinuous && !this.isSpeaking) {
        clearTimeout(this.webRestartTimer);
        this.webRestartTimer = setTimeout(() => {
          if (this.isContinuous && !this.isSpeaking) {
            this.startWebRecognizer(SpeechRecognition, language);
          }
        }, 300);
      } else if (!this.isSpeaking) {
        this.callbacks.onState?.('idle', null);
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.callbacks.onState?.('error', 'Failed to start microphone.');
    }
  }

  stopWebRecognizer() {
    clearTimeout(this.webRestartTimer);
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.stop();
      } catch {
        // ignore stop errors
      }
      this.recognition = null;
    }
    this.isListening = false;
  }

  async stopListening() {
    this.isContinuous = false;
    if (VoiceBridge) {
      try {
        await VoiceBridge.stopListening();
      } catch {
        // ignore
      }
      this.isListening = false;
      this.callbacks.onState?.('idle', null);
      return;
    }
    this.stopWebRecognizer();
    this.callbacks.onState?.('idle', null);
  }

  async speak(text) {
    const clean = stripForSpeech(text);
    if (!clean) return;

    if (VoiceBridge) {
      this.isSpeaking = true;
      try {
        await new Promise((resolve) => {
          let resolved = false;
          let handle = null;
          let timer = null;
          const finish = async () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            try {
              await handle?.remove?.();
            } catch {
              // ignore
            }
            this.isSpeaking = false;
            resolve();
          };

          timer = setTimeout(finish, Math.max(2500, clean.length * 80));
          VoiceBridge.addListener('ttsDone', () => {
            finish();
          })
            .then((h) => {
              handle = h;
              if (resolved) {
                h?.remove?.();
                return;
              }
              VoiceBridge.speak({ text: clean }).catch(() => finish());
            })
            .catch(() => {
              VoiceBridge.speak({ text: clean }).finally(finish);
            });
        });
      } catch {
        this.isSpeaking = false;
      }
      return;
    }

    if (!isSpeechOutputSupported()) return;

    const wasListening = this.isListening;
    if (wasListening) {
      this.stopWebRecognizer();
    }
    this.isSpeaking = true;

    await new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferredVoice =
          voices.find((v) => /natural|neural/i.test(v.name) && /^en/i.test(v.lang)) ||
          voices.find((v) => /google|aria|jenny|neerja|samantha|daniel/i.test(v.name) && /^en/i.test(v.lang)) ||
          voices.find((v) => /^en-(IN|US|GB)/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang));
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        utterance.rate = 1.03;
        utterance.pitch = 1.02;
        const done = () => {
          this.isSpeaking = false;
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        setTimeout(done, Math.max(3000, clean.length * 80));
        window.speechSynthesis.speak(utterance);
      } catch {
        this.isSpeaking = false;
        resolve();
      }
    });

    if (this.isContinuous) {
      const SpeechRecognition = getWebSpeechRecognition();
      if (SpeechRecognition) {
        this.startWebRecognizer(SpeechRecognition);
      }
    }
  }

  async stopSpeaking() {
    this.isSpeaking = false;
    if (VoiceBridge) {
      try {
        await VoiceBridge.stopSpeaking();
      } catch {
        // ignore
      }
      return;
    }
    if (isSpeechOutputSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }
}

export const voiceService = new VoiceService();
export default voiceService;
