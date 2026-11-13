// Web Audio API Synthesizer for Task Due Alarms
// Completely self-contained with no external audio file dependencies

class AlarmAudioService {
  constructor() {
    this.audioCtx = null;
    this.intervalId = null;
    this.isPlaying = false;
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
   * Plays a single melodic two-tone alarm pulse (e.g., 880Hz -> 1046Hz)
   */
  playAlarmPulse() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      // First beep: 880Hz (A5)
      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(880 * 1.5, now);

      // Pitch sweep to 1046Hz (C6)
      osc1.frequency.exponentialRampToValueAtTime(1046, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(1046 * 1.5, now + 0.15);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);

      // Second burst 180ms later for standard alarm "beep-beep"
      const now2 = now + 0.18;
      const osc3 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1046, now2);
      osc3.frequency.exponentialRampToValueAtTime(1318, now2 + 0.15);

      gain2.gain.setValueAtTime(0.001, now2);
      gain2.gain.linearRampToValueAtTime(0.4, now2 + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, now2 + 0.28);

      osc3.connect(gain2);
      gain2.connect(ctx.destination);

      osc3.start(now2);
      osc3.stop(now2 + 0.3);
    } catch {
      // ignore audio context policy errors
    }
  }

  /**
   * Starts a repeating alarm ringtone pattern until stopAlarm is called
   */
  startAlarm() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.playAlarmPulse();
    this.intervalId = setInterval(() => {
      if (this.isPlaying) {
        this.playAlarmPulse();
      }
    }, 1200);
  }

  /**
   * Silences the active alarm immediately
   */
  stopAlarm() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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
        gain.gain.linearRampToValueAtTime(0.2, noteTime + 0.02);
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
