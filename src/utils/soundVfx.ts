export type SoundEffectType =
  | 'notification'
  | 'message'
  | 'message-sent'
  | 'upload-start'
  | 'upload-success'
  | 'like'
  | 'unlike'
  | 'save'
  | 'comment'
  | 'follow'
  | 'error'
  | 'ui-tap';

const SOUND_PREF_KEY = 'hostelverse_sound_vfx_enabled';
const listeners = new Set<(enabled: boolean) => void>();
const lastPlayedAt = new Map<SoundEffectType, number>();

let sharedCtx: AudioContext | null = null;
let unlockBound = false;

function readInitialEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(SOUND_PREF_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

let soundEnabled = readInitialEnabled();

export function isSoundVfxEnabled(): boolean {
  return soundEnabled;
}

export function setSoundVfxEnabled(next: boolean): void {
  soundEnabled = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    }
  } catch {
    // ignore storage errors
  }
  listeners.forEach((cb) => cb(next));
  if (next) {
    playSound('ui-tap');
  }
}

export function toggleSoundVfx(): boolean {
  const next = !soundEnabled;
  setSoundVfxEnabled(next);
  return next;
}

export function subscribeSoundPreference(cb: (enabled: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctx();
  }

  if (!unlockBound) {
    unlockBound = true;
    const unlock = () => {
      if (sharedCtx && sharedCtx.state === 'suspended') {
        sharedCtx.resume().catch(() => {});
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }

  return sharedCtx;
}

interface ToneSpec {
  freq: number;
  endFreq?: number;
  delay?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

function scheduleTones(ctx: AudioContext, tones: ToneSpec[]): void {
  const master = ctx.createGain();
  master.gain.value = 0.85;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3800;
  filter.Q.value = 0.7;

  master.connect(filter);
  filter.connect(ctx.destination);

  const baseTime = ctx.currentTime + 0.005;

  for (const tone of tones) {
    const start = baseTime + (tone.delay || 0);
    const end = start + tone.duration;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = tone.type || 'sine';
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.endFreq && tone.endFreq !== tone.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.endFreq), end);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(tone.gain, start + Math.min(0.014, tone.duration * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(env);
    env.connect(master);

    osc.start(start);
    osc.stop(end + 0.02);
  }
}

export function playSound(effect: SoundEffectType): void {
  if (!soundEnabled) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prev = lastPlayedAt.get(effect) || 0;
  if (now - prev < 65) return;
  lastPlayedAt.set(effect, now);

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    switch (effect) {
      case 'notification':
        // Warm champagne-gold three-note crystal chime
        scheduleTones(ctx, [
          { freq: 739.99, duration: 0.16, gain: 0.09, type: 'sine', delay: 0 },
          { freq: 932.33, duration: 0.18, gain: 0.1, type: 'sine', delay: 0.075 },
          { freq: 1108.73, duration: 0.28, gain: 0.085, type: 'triangle', delay: 0.15 },
        ]);
        break;

      case 'message':
        // Soft pearl-glass incoming message ping
        scheduleTones(ctx, [
          { freq: 587.33, duration: 0.12, gain: 0.09, type: 'sine', delay: 0 },
          { freq: 880.0, duration: 0.22, gain: 0.1, type: 'sine', delay: 0.065 },
        ]);
        break;

      case 'message-sent':
        // Subtle airy outgoing message tap
        scheduleTones(ctx, [
          { freq: 523.25, endFreq: 659.25, duration: 0.09, gain: 0.055, type: 'sine' },
        ]);
        break;

      case 'upload-start':
        // Gentle rising shimmer as upload begins
        scheduleTones(ctx, [
          { freq: 440, endFreq: 659.25, duration: 0.16, gain: 0.065, type: 'sine' },
          { freq: 659.25, duration: 0.18, gain: 0.055, type: 'triangle', delay: 0.07 },
        ]);
        break;

      case 'upload-success':
        // Satisfying major-9th celebration chord bloom
        scheduleTones(ctx, [
          { freq: 523.25, duration: 0.2, gain: 0.08, type: 'sine', delay: 0 },
          { freq: 659.25, duration: 0.22, gain: 0.08, type: 'sine', delay: 0.055 },
          { freq: 783.99, duration: 0.26, gain: 0.085, type: 'sine', delay: 0.11 },
          { freq: 1174.66, duration: 0.34, gain: 0.07, type: 'triangle', delay: 0.165 },
        ]);
        break;

      case 'like':
        // Tactile velvet pop
        scheduleTones(ctx, [
          { freq: 620, endFreq: 987.77, duration: 0.09, gain: 0.095, type: 'sine' },
          { freq: 1318.51, duration: 0.08, gain: 0.045, type: 'triangle', delay: 0.025 },
        ]);
        break;

      case 'unlike':
        // Quiet low release tap
        scheduleTones(ctx, [
          { freq: 520, endFreq: 360, duration: 0.075, gain: 0.045, type: 'sine' },
        ]);
        break;

      case 'save':
        // Bookmark crisp chime
        scheduleTones(ctx, [
          { freq: 659.25, duration: 0.09, gain: 0.07, type: 'sine' },
          { freq: 830.61, duration: 0.14, gain: 0.075, type: 'sine', delay: 0.05 },
        ]);
        break;

      case 'comment':
        // Clean reply chime
        scheduleTones(ctx, [
          { freq: 659.25, duration: 0.1, gain: 0.075, type: 'sine' },
          { freq: 880.0, duration: 0.16, gain: 0.075, type: 'sine', delay: 0.055 },
        ]);
        break;

      case 'follow':
        // Warm welcoming chord
        scheduleTones(ctx, [
          { freq: 587.33, duration: 0.12, gain: 0.075, type: 'sine' },
          { freq: 739.99, duration: 0.14, gain: 0.075, type: 'sine', delay: 0.055 },
          { freq: 880.0, duration: 0.2, gain: 0.08, type: 'triangle', delay: 0.11 },
        ]);
        break;

      case 'error':
        // Soft muted warm low thud (never harsh)
        scheduleTones(ctx, [
          { freq: 196, endFreq: 130.81, duration: 0.18, gain: 0.08, type: 'triangle' },
        ]);
        break;

      case 'ui-tap':
        scheduleTones(ctx, [
          { freq: 880, duration: 0.055, gain: 0.05, type: 'sine' },
        ]);
        break;
    }
  } catch {
    // Ignore audio engine failures gracefully
  }
}
