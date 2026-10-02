// Звук без файлов: всё синтезируется Web Audio — ни лишних мегабайт, ни чужих прав.
// Звуки и музыка включаются отдельно, выбор помнится в браузере. Браузер не даёт играть
// до первого касания, поэтому контекст создаётся и музыка стартует по первому жесту.

export type Sfx = 'click' | 'coin' | 'gold' | 'hit' | 'crit' | 'miss' | 'win' | 'lose' | 'level' | 'event' | 'pop' | 'error' | 'dice' | 'card' | 'unlock';

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
  }
}

// --- музыка ----------------------------------------------------------------------------
// Блатной перебор в ля-миноре: Am — Dm — E — Am, бас на сильную долю, мелодия поверх.

const N = (semi: number) => 220 * Math.pow(2, semi / 12); // от ля малой октавы
const CHORDS = [
  { bass: N(-12), notes: [N(0), N(3), N(7), N(12)] }, // Am
  { bass: N(-7), notes: [N(5), N(8), N(12), N(17)] }, // Dm
  { bass: N(-5), notes: [N(7), N(11), N(14), N(19)] }, // E
  { bass: N(-12), notes: [N(0), N(3), N(7), N(12)] }, // Am
];
// мелодия по восьмым: полутоны от ля первой октавы (440), null — пауза
const TUNE: (number | null)[][] = [
  [12, null, 15, 14, 12, null, 10, 12],
  [8, null, 10, 12, 13, 12, 10, null],
  [11, null, 14, 12, 11, 10, 8, null],
  [7, 8, 10, 12, 12, null, null, null],
  [12, 14, 15, null, 17, 15, 14, 12],
  [13, null, 12, 10, 8, null, 10, null],
  [11, 12, 14, null, 16, 14, 12, 11],
  [12, null, null, null, 7, null, null, null],
];
const BPM = 92;
let musicTimer = 0;
let nextBar = 0;
let bar = 0;

function scheduleBar(at: number) {
  const beat = 60 / BPM;
  const chord = CHORDS[bar % CHORDS.length];
  const tune = TUNE[bar % TUNE.length];
  // бас: сильная и третья доли
  pluck(chord.bass, at, beat * 1.8, 0.55, musicBus);
  pluck(chord.bass * 1.5, at + beat * 2, beat * 1.6, 0.4, musicBus);
  // перебор: восьмые по аккорду
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern.forEach((k, i) => pluck(chord.notes[k], at + (beat / 2) * i, beat * 1.2, 0.22, musicBus));
  // мелодия — каждые вторые четыре такта, чтобы не надоедала
  if (Math.floor(bar / 8) % 2 === 1)
    tune.forEach((s, i) => {
      if (s !== null) tone(440 * Math.pow(2, (s - 12) / 12), at + (beat / 2) * i, beat * 0.9, { type: 'triangle', vol: 0.09, bus: musicBus, attack: 0.02 });
    });
  bar++;
}

function musicTick() {
  if (!ctx) return;
  const beat = 60 / BPM;
  while (nextBar < ctx.currentTime + 1.2) {
    scheduleBar(nextBar);
    nextBar += beat * 4;
  }
}

export function startMusic() {
  if (!prefs.music || musicTimer || document.hidden) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  nextBar = c.currentTime + 0.1;
  musicTimer = window.setInterval(musicTick, 300);
  musicTick();
  musicBus!.gain.cancelScheduledValues(c.currentTime);
  musicBus!.gain.setValueAtTime(0.0001, c.currentTime);
  musicBus!.gain.exponentialRampToValueAtTime(0.45, c.currentTime + 2);
}

export function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = 0;
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }
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
export async function renderPreview(seconds = 24): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, 44100 * seconds, 44100);
  const keep = { ctx, master, sfxBus, musicBus, noiseBuf, bar };
  ctx = off as unknown as AudioContext;
  master = off.createGain();
  master.gain.value = 0.7;
  master.connect(off.destination);
  sfxBus = off.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  musicBus = off.createGain();
  musicBus.gain.value = 0.45;
  musicBus.connect(master);
  noiseBuf = off.createBuffer(1, 44100, 44100);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  bar = 0;
  // музыка: 16 тактов (с мелодией во второй восьмёрке)
  const barLen = (60 / BPM) * 4;
  const music = Math.min(16, Math.floor((seconds - 8) / barLen));
  for (let b = 0; b < music; b++) scheduleBar(0.1 + b * barLen);
  // эффекты по очереди после музыки
  const sfx: Sfx[] = ['click', 'pop', 'coin', 'gold', 'hit', 'crit', 'miss', 'dice', 'card', 'event', 'unlock', 'level', 'win', 'lose', 'error'];
  const was = prefs.sfx;
  prefs.sfx = true;
  const t0 = 0.4 + music * barLen;
  sfx.forEach((s, i) => {
    const at = t0 + i * 0.5;
    const realNow = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!;
    // play() считает от currentTime — подставляем нужный момент
    Object.defineProperty(off, 'currentTime', { configurable: true, get: () => at });
    play(s);
    Object.defineProperty(off, 'currentTime', realNow);
  });
  prefs.sfx = was;
  const buf = await off.startRendering();
  ({ ctx, master, sfxBus, musicBus, noiseBuf, bar } = keep);
  return buf;
}
