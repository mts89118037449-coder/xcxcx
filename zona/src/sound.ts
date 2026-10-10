// Звук без файлов: всё синтезируется Web Audio — ни лишних мегабайт, ни чужих прав.
// Звуки и музыка включаются отдельно, выбор помнится в браузере. Браузер не даёт играть
// до первого касания, поэтому контекст создаётся и музыка стартует по первому жесту.

export type Sfx = 'click' | 'coin' | 'gold' | 'hit' | 'crit' | 'miss' | 'win' | 'lose' | 'level' | 'event' | 'pop' | 'error' | 'dice' | 'card' | 'unlock'
  | 'step' | 'whoosh' | 'thud' | 'yawn' | 'cough' | 'clink' | 'hammer' | 'slurp' | 'shutter' | 'combo' | 'finisher' | 'hum';

interface Prefs {
  sfx: boolean;
  music: boolean;
  volume: number; // 0..1
}

const KEY = 'zona:sound';
const load = (): Prefs => {
  try {
    return { sfx: true, music: true, volume: 0.7, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { sfx: true, music: true, volume: 0.7 };
  }
};

let prefs = load();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* приватный режим */
  }
  listeners.forEach((f) => f());
}

export const soundPrefs = () => prefs;
export function onSoundPrefs(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = prefs.volume;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.45;
  musicBus.connect(master);
  // белый шум на секунду — для ударов, костей и шороха
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// --- кирпичики ------------------------------------------------------------------------

function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; bus?: GainNode | null; attack?: number } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'triangle';
  o.frequency.setValueAtTime(freq, at);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), at + dur);
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v, at + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(opts.bus ?? sfxBus!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(at: number, dur: number, opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; bus?: GainNode | null } = {}) {
  if (!ctx || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 1200;
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.4, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(opts.bus ?? sfxBus!);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

/** Щипок струны: пила + треугольник через фильтр, который быстро закрывается, — звучит как гитара во дворе. */
function pluck(freq: number, at: number, dur: number, vol: number, bus: GainNode | null) {
  if (!ctx) return;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 0;
  f.frequency.setValueAtTime(Math.min(8000, freq * 9), at);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), at + Math.min(0.35, dur));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  for (const [type, k, v] of [['sawtooth', 1, 0.6], ['triangle', 1.003, 0.8]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * k, at);
    const og = ctx.createGain();
    og.gain.value = v;
    o.connect(og).connect(f);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  f.connect(g).connect(bus ?? sfxBus!);
}

// --- эффекты ---------------------------------------------------------------------------

export function play(s: Sfx) {
  if (!prefs.sfx) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended' && !(c instanceof OfflineAudioContext)) c.resume();
  const t = c.currentTime + 0.01;
  switch (s) {
    case 'click':
      tone(1400, t, 0.04, { type: 'square', vol: 0.05 });
      break;
    case 'pop':
      tone(500, t, 0.08, { type: 'sine', vol: 0.25, slide: 2.2 });
      break;
    case 'coin':
      tone(988, t, 0.09, { type: 'square', vol: 0.12 });
      tone(1319, t + 0.07, 0.22, { type: 'square', vol: 0.12 });
      break;
    case 'gold':
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.05, 0.25, { type: 'triangle', vol: 0.18 }));
      break;
    case 'hit':
      noise(t, 0.12, { vol: 0.6, freq: 900, q: 0.8 });
      tone(120, t, 0.14, { type: 'sine', vol: 0.5, slide: 0.5 });
      break;
    case 'crit':
      noise(t, 0.2, { vol: 0.8, freq: 1800, q: 0.6 });
      tone(90, t, 0.25, { type: 'sine', vol: 0.7, slide: 0.4 });
      tone(1800, t, 0.12, { type: 'sawtooth', vol: 0.08, slide: 0.5 });
      break;
    case 'miss':
      noise(t, 0.18, { vol: 0.25, freq: 3000, q: 0.5, type: 'highpass' });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.35, { type: 'triangle', vol: 0.22 }));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.16, 0.4, { type: 'sawtooth', vol: 0.09 }));
      break;
    case 'level':
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.2, { type: 'square', vol: 0.1 }));
      [1047, 1319].forEach((f) => tone(f, t + 0.3, 0.6, { type: 'triangle', vol: 0.16 }));
      break;
    case 'event':
      tone(880, t, 0.5, { type: 'sine', vol: 0.18 });
      tone(1320, t + 0.02, 0.4, { type: 'sine', vol: 0.08 });
      tone(880, t + 0.22, 0.5, { type: 'sine', vol: 0.14 });
      break;
    case 'unlock':
      [660, 880, 1320].forEach((f, i) => tone(f, t + i * 0.08, 0.3, { type: 'triangle', vol: 0.16 }));
      break;
    case 'error':
      tone(180, t, 0.18, { type: 'square', vol: 0.08 });
      tone(140, t + 0.1, 0.2, { type: 'square', vol: 0.08 });
      break;
    case 'dice':
      for (let i = 0; i < 6; i++) noise(t + i * 0.06 + Math.random() * 0.02, 0.04, { vol: 0.35, freq: 2500 + Math.random() * 1500, q: 3 });
      break;
    case 'card':
      noise(t, 0.07, { vol: 0.3, freq: 4000, q: 0.7, type: 'highpass' });
      break;
    // --- звуки движений: шаги, взмахи, падения, бытовуха ---
    case 'step':
      noise(t, 0.05, { vol: 0.12, freq: 320 + Math.random() * 120, q: 1.2, type: 'lowpass' });
      break;
    case 'whoosh': {
      if (!ctx || !noiseBuf) break;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(f).connect(g).connect(sfxBus!);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.2);
      break;
    }
    case 'thud':
      tone(70, t, 0.3, { type: 'sine', vol: 0.7, slide: 0.5 });
      noise(t, 0.18, { vol: 0.45, freq: 260, q: 0.7, type: 'lowpass' });
      break;
    case 'yawn':
      tone(260, t, 0.7, { type: 'sawtooth', vol: 0.05, slide: 0.55, attack: 0.15 });
      tone(390, t, 0.7, { type: 'sine', vol: 0.06, slide: 0.55, attack: 0.15 });
      break;
    case 'cough':
      for (const k of [0, 0.16]) noise(t + k, 0.1, { vol: 0.3, freq: 700, q: 1.5 });
      break;
    case 'clink':
      tone(2400, t, 0.18, { type: 'sine', vol: 0.12 });
      tone(3600, t + 0.005, 0.12, { type: 'sine', vol: 0.06 });
      break;
    case 'hammer':
      noise(t, 0.06, { vol: 0.5, freq: 2200, q: 2 });
      tone(900, t, 0.08, { type: 'square', vol: 0.06, slide: 0.6 });
      break;
    case 'slurp':
      noise(t, 0.25, { vol: 0.15, freq: 1400, q: 4 });
      break;
    case 'shutter':
      noise(t, 0.03, { vol: 0.5, freq: 5000, q: 1, type: 'highpass' });
      noise(t + 0.09, 0.04, { vol: 0.4, freq: 3500, q: 1, type: 'highpass' });
      break;
    case 'combo':
      [784, 988].forEach((f, i) => tone(f, t + i * 0.06, 0.14, { type: 'square', vol: 0.09 }));
      break;
    case 'finisher':
      noise(t, 0.35, { vol: 0.9, freq: 1200, q: 0.5 });
      tone(60, t, 0.5, { type: 'sine', vol: 0.9, slide: 0.4 });
      [523, 784, 1047].forEach((f, i) => tone(f, t + 0.12 + i * 0.07, 0.3, { type: 'square', vol: 0.1 }));
      break;
    case 'hum':
      tone(150, t, 0.4, { type: 'sine', vol: 0.08, slide: 0.9, attack: 0.05 });
      break;
  }
}

// --- музыка: отдельный файл, грузится после первого касания -------------------------------

export type Theme = 'yard' | 'night' | 'fight' | 'bath' | 'canteen' | 'library' | 'club' | 'visits' | 'factory' | 'shizo';

let theme: Theme = 'yard';
/** Сменить музыку: со следующего такта, без обрыва. */
export function setMusicTheme(t: Theme) {
  theme = t;
}
export const musicTheme = () => theme;

type MusicModule = typeof import('./music.ts');
let musicMod: Promise<MusicModule> | null = null;
const music = () => (musicMod ??= import('./music.ts'));

/** То, что нужно музыке от звукового движка. */
export const engine = {
  ensure,
  get ctx() {
    return ctx;
  },
  get musicBus() {
    return musicBus;
  },
  tone,
  noise,
  pluck,
  /** для отрисовки в буфер: подменить контекст и шины */
  swap(next: { ctx: AudioContext | null; master: GainNode | null; sfxBus: GainNode | null; musicBus: GainNode | null; noiseBuf: AudioBuffer | null }) {
    const prev = { ctx, master, sfxBus, musicBus, noiseBuf };
    ({ ctx, master, sfxBus, musicBus, noiseBuf } = next);
    return prev;
  },
};

export function startMusic() {
  if (!prefs.music || document.hidden) return;
  music().then((m) => prefs.music && !document.hidden && m.startMusic());
}

export function stopMusic() {
  if (musicMod) music().then((m) => m.stopMusic());
}

export function setSoundPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  if (master && ctx) master.gain.setValueAtTime(prefs.volume, ctx.currentTime);
  if (prefs.music) startMusic();
  else stopMusic();
  save();
}

/** Подключить звук к странице: первое касание будит аудио, свёрнутая игра молчит, кнопки щёлкают. */
export function initSound() {
  const wake = () => {
    ensure();
    ctx?.resume();
    startMusic();
  };
  window.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMusic();
      ctx?.suspend();
    } else if (ctx) {
      ctx.resume();
      startMusic();
    }
  });
  // тихий щелчок на любые кнопки
  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = (e.target as HTMLElement | null)?.closest('button');
      if (b && !b.disabled) play('click');
    },
    true,
  );
}

/** Отрисовать кусок музыки и все эффекты в буфер — для проверки и прослушивания без игры. */
export async function renderPreview(seconds = 24, themes: Theme[] = []): Promise<AudioBuffer> {
  return (await music()).renderPreview(seconds, themes);
}
