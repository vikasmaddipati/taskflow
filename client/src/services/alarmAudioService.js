// Audio & Telephony Ringtone Synthesizer for Task Due Alarms and Incoming Calls
// Pure self-contained Web Audio API + HTML5 Audio fallback with zero external assets

class AlarmAudioService {
  constructor() {
    this.audioCtx = null;
    this.ringInterval = null;
    this.isPlaying = false;
    this.isUnlocked = false;
    this.fallbackAudio = null;

    if (typeof window !== 'undefined') {
      this.attachAutoUnlock();
    }
  }

  attachAutoUnlock() {
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  unlock() {
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.isUnlocked = true;
    } catch {
      // ignore
    }
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Generates a single burst of telephone ringback tones (440Hz + 480Hz dual frequency)
   */
  playTelephoneRingBurst() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      // Standard telephone frequencies: 440Hz + 480Hz
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      // Ring envelope (1.8 seconds on, slight fade-in and fade-out)
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      gain.gain.setValueAtTime(0.4, now + 1.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.85);
      osc2.stop(now + 1.85);
    } catch {
      // ignore audio context policy errors
    }
  }

  /**
   * Starts a continuous telephone ringtone loop (2 seconds ring, 2 seconds pause)
   */
  startAlarm() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.unlock();

    // 1. Play first ring immediately
    this.playTelephoneRingBurst();

    // 2. Schedule repeating cadence (every 3.6 seconds)
    this.ringInterval = setInterval(() => {
      if (this.isPlaying) {
        this.playTelephoneRingBurst();
      }
    }, 3600);
  }

  /**
   * Silences all active ringtones and sounds immediately
   */
  stopAlarm() {
    this.isPlaying = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.pause();
        this.fallbackAudio.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }

  /**
   * Short connection chirp played when user answers the phone call
   */
  playCallConnectedTone() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // ignore
    }
  }

  /**
   * Plays a pleasant completion chime (positive confirmation)
   */
  playCompletionChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteTime = now + idx * 0.09;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.001, noteTime);
        gain.gain.linearRampToValueAtTime(0.25, noteTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.38);
      });
    } catch {
      // ignore
    }
  }
}

export const alarmAudioService = new AlarmAudioService();
export default alarmAudioService;
