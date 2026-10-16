// Музыка: блатной перебор и фон под каждое место. Грузится отдельно — после первого касания.
import { engine, musicTheme, play, soundPrefs, type Sfx, type Theme } from './sound.ts';

const { tone, noise, pluck } = engine;
/** тема, подменённая для отрисовки в буфер */
let override: Theme | null = null;
const cur = () => override ?? musicTheme();
// --- музыка ----------------------------------------------------------------------------
// Блатной перебор в ля-миноре: Am — Dm — E — Am, бас на сильную долю, мелодия поверх.
// У каждого места — свой вариант: темп, лад, сколько нот и что звучит фоном (капли, станки, сверчки).

const N = (semi: number) => 220 * Math.pow(2, semi / 12); // от ля малой октавы
const MINOR = [
  { bass: -12, notes: [0, 3, 7, 12] }, // Am
  { bass: -7, notes: [5, 8, 12, 17] }, // Dm
  { bass: -5, notes: [7, 11, 14, 19] }, // E
  { bass: -12, notes: [0, 3, 7, 12] }, // Am
];
const MAJOR = [
  { bass: -9, notes: [3, 7, 10, 15] }, // C
  { bass: -4, notes: [8, 12, 15, 20] }, // F
  { bass: -2, notes: [10, 14, 17, 22] }, // G
  { bass: -9, notes: [3, 7, 10, 15] }, // C
];


interface ThemeDef {
  bpm: number;
  /** сдвиг тональности, полутоны */
  key: number;
  chords: typeof MINOR;
  /** перебор по восьмым (индексы нот аккорда); null — только бас */
  pattern: number[] | null;
  /** громкость перебора */
  pick: number;
  /** мелодия: каждые вторые 4 такта, тембр */
  melody: OscillatorType | null;
  /** ударные: бочка и рабочий */
  drums?: boolean;
  /** фон: что звучит раз в такт */
  amb?: (at: number, bar: number) => void;
}

const rnd = Math.random;
const AMB = {
  crickets(at: number, len: number) {
    for (let i = 0; i < 3; i++) {
      const t = at + rnd() * len;
      for (let k = 0; k < 3; k++) tone(4300 + rnd() * 400, t + k * 0.05, 0.03, { type: 'sine', vol: 0.025, bus: engine.musicBus });
    }
  },
  drips(at: number, len: number, n = 2) {
    for (let i = 0; i < n; i++) tone(900 + rnd() * 700, at + rnd() * len, 0.09, { type: 'sine', vol: 0.06, slide: 2.4, bus: engine.musicBus });
  },
  hiss(at: number, len: number) {
    noise(at, len, { vol: 0.03, freq: 5000, q: 0.3, type: 'highpass', bus: engine.musicBus });
  },
  clink(at: number, len: number) {
    for (let i = 0; i < 2; i++) tone(2200 + rnd() * 1400, at + rnd() * len, 0.12, { type: 'triangle', vol: 0.04, bus: engine.musicBus });
  },
  murmur(at: number, len: number) {
    noise(at, len, { vol: 0.05, freq: 380, q: 0.6, bus: engine.musicBus });
  },
  page(at: number, len: number) {
    if (rnd() < 0.4) noise(at + rnd() * len, 0.25, { vol: 0.05, freq: 3500, q: 0.4, type: 'highpass', bus: engine.musicBus });
  },
  machine(at: number, len: number, beat: number) {
    tone(55, at, len, { type: 'sawtooth', vol: 0.025, bus: engine.musicBus, attack: 0.05 });
    for (const b of [1, 3]) {
      noise(at + b * beat, 0.08, { vol: 0.12, freq: 3000, q: 2, bus: engine.musicBus });
      tone(300, at + b * beat, 0.1, { type: 'square', vol: 0.03, slide: 0.7, bus: engine.musicBus });
    }
  },
  /** двор: порыв ветра, далёкий лай, карканье */
  yard(at: number, len: number) {
    if (rnd() < 0.35) noise(at + rnd() * len * 0.5, 1.6, { vol: 0.035, freq: 420, q: 0.4, type: 'lowpass', bus: engine.musicBus });
    if (rnd() < 0.18) {
      const t = at + rnd() * len;
      for (let k = 0; k < 2; k++) tone(330 - k * 20, t + k * 0.22, 0.12, { type: 'sawtooth', vol: 0.025, slide: 0.6, bus: engine.musicBus });
    }
    if (rnd() < 0.12) {
      const t = at + rnd() * len;
      for (let k = 0; k < 2; k++) noise(t + k * 0.3, 0.18, { vol: 0.04, freq: 1300, q: 3, bus: engine.musicBus });
    }
  },
  /** хата: капли из крана и храп соседа */
  cell(at: number, len: number, bar: number) {
    AMB.drips(at, len, 1);
    if (bar % 3 === 0) {
      noise(at + len * 0.2, 1.1, { vol: 0.05, freq: 160, q: 1.2, bus: engine.musicBus });
      noise(at + len * 0.62, 0.7, { vol: 0.035, freq: 260, q: 1.5, bus: engine.musicBus });
    }
  },
  drone(at: number, len: number) {
    tone(N(-24), at, len + 0.3, { type: 'sine', vol: 0.06, bus: engine.musicBus, attack: 0.6 });
  },
};

const beatOf = (bpm: number) => 60 / bpm;
const THEMES: Record<Theme, ThemeDef> = {
  yard: { bpm: 92, key: 0, chords: MINOR, pattern: [0, 1, 2, 3, 2, 1, 2, 3], pick: 0.22, melody: 'triangle', amb: (at) => AMB.yard(at, beatOf(92) * 4) },
  // в хате тише и медленнее, слышно кран и храп
  cell: { bpm: 84, key: 0, chords: MINOR, pattern: [0, 2, 3, 2], pick: 0.15, melody: 'triangle', amb: (at, b) => AMB.cell(at, beatOf(84) * 4, b) },
  // ночью то же, но медленнее, тише, без мелодии — и сверчки
  night: { bpm: 70, key: -2, chords: MINOR, pattern: [0, 2, 3, 2], pick: 0.14, melody: null, amb: (at) => AMB.crickets(at, beatOf(70) * 4) },
  fight: { bpm: 118, key: -5, chords: MINOR, pattern: [0, 0, 2, 0, 3, 0, 2, 1], pick: 0.18, melody: 'sawtooth', drums: true },
  bath: { bpm: 80, key: 2, chords: MINOR, pattern: [0, 2, 3, 2], pick: 0.16, melody: 'sine', amb: (at) => (AMB.drips(at, beatOf(80) * 4), AMB.hiss(at, beatOf(80) * 4)) },
  canteen: { bpm: 100, key: 0, chords: MINOR, pattern: [0, 1, 2, 1, 3, 1, 2, 1], pick: 0.16, melody: 'square', amb: (at) => (AMB.clink(at, beatOf(100) * 4), AMB.murmur(at, beatOf(100) * 4)) },
  library: { bpm: 66, key: 3, chords: MINOR, pattern: [0, 2, 3, 2], pick: 0.12, melody: 'sine', amb: (at) => AMB.page(at, beatOf(66) * 4) },
  club: { bpm: 108, key: 0, chords: MAJOR, pattern: [0, 1, 2, 3, 2, 1, 2, 3], pick: 0.2, melody: 'square' },
  visits: { bpm: 76, key: 0, chords: MAJOR, pattern: [0, 2, 3, 2], pick: 0.15, melody: 'triangle' },
  factory: { bpm: 96, key: -2, chords: MINOR, pattern: [0, 2, 0, 2], pick: 0.12, melody: null, amb: (at) => AMB.machine(at, beatOf(96) * 4, beatOf(96)) },
  shizo: { bpm: 60, key: -3, chords: MINOR, pattern: null, pick: 0.1, melody: null, amb: (at) => (AMB.drone(at, beatOf(60) * 4), AMB.drips(at, beatOf(60) * 4, 1)) },
};


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
let musicTimer = 0;
let nextBar = 0;
let bar = 0;

/** Длина такта текущей темы, с. */
function barLen() {
  return beatOf(THEMES[cur()].bpm) * 4;
}

function scheduleBar(at: number) {
  const th = THEMES[cur()];
  const beat = beatOf(th.bpm);
  const ch = th.chords[bar % th.chords.length];
  const k = th.key;
  const bass = N(ch.bass + k);
  const notes = ch.notes.map((n) => N(n + k));
  // для мажора мелодия сдвигается на терцию, чтобы лечь в лад
  const tune = TUNE[bar % TUNE.length];
  const shift = th.chords === MAJOR ? 3 : 0;
  // бас: сильная и третья доли
  pluck(bass, at, beat * 1.8, 0.55, engine.musicBus);
  pluck(bass * 1.5, at + beat * 2, beat * 1.6, 0.4, engine.musicBus);
  // перебор по аккорду: восьмые (или четверти, если узор короткий)
  if (th.pattern) {
    const step = (beat * 4) / th.pattern.length;
    th.pattern.forEach((n, i) => pluck(notes[n], at + step * i, step * 2.4, th.pick, engine.musicBus));
  }
  // мелодия — каждые вторые четыре такта, чтобы не надоедала
  if (th.melody && Math.floor(bar / 8) % 2 === 1)
    tune.forEach((s, i) => {
      if (s !== null) tone(440 * Math.pow(2, (s - 12 + k + shift) / 12), at + (beat / 2) * i, beat * 0.9, { type: th.melody!, vol: th.melody === 'triangle' || th.melody === 'sine' ? 0.09 : 0.035, bus: engine.musicBus, attack: 0.02 });
    });
  // ударные: бочка на каждую долю, рабочий — на вторую и четвёртую
  if (th.drums)
    for (let b = 0; b < 4; b++) {
      tone(150, at + b * beat, 0.16, { type: 'sine', vol: 0.32, slide: 0.3, bus: engine.musicBus });
      if (b % 2) noise(at + b * beat, 0.12, { vol: 0.12, freq: 1800, q: 0.7, bus: engine.musicBus });
    }
  th.amb?.(at, bar);
  bar++;
}

function musicTick() {
  if (!engine.ctx) return;
  while (nextBar < engine.ctx.currentTime + 1.2) {
    const len = barLen();
    scheduleBar(nextBar);
    nextBar += len;
  }
}

export function startMusic() {
  if (musicTimer || document.hidden) return;
  const c = engine.ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  nextBar = c.currentTime + 0.1;
  musicTimer = window.setInterval(musicTick, 300);
  musicTick();
  engine.musicBus!.gain.cancelScheduledValues(c.currentTime);
  engine.musicBus!.gain.setValueAtTime(0.0001, c.currentTime);
  engine.musicBus!.gain.exponentialRampToValueAtTime(0.45, c.currentTime + 2);
}

export function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = 0;
  if (engine.ctx && engine.musicBus) {
    engine.musicBus.gain.cancelScheduledValues(engine.ctx.currentTime);
    engine.musicBus.gain.setValueAtTime(engine.musicBus.gain.value, engine.ctx.currentTime);
    engine.musicBus.gain.exponentialRampToValueAtTime(0.0001, engine.ctx.currentTime + 0.4);
  }
}


/** Отрисовать кусок музыки и все эффекты в буфер — для проверки и прослушивания без игры. */
export async function renderPreview(seconds = 24, themes: Theme[] = []): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, 44100 * seconds, 44100);
  const master = off.createGain();
  master.gain.value = 0.7;
  master.connect(off.destination);
  const sfxBus = off.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  const musicBus = off.createGain();
  musicBus.gain.value = 0.45;
  musicBus.connect(master);
  const noiseBuf = off.createBuffer(1, 44100, 44100);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const keep = engine.swap({ ctx: off as unknown as AudioContext, master, sfxBus, musicBus, noiseBuf });
  const keepBar = bar;
  try {
    let at = 0.1;
    if (themes.length) {
      // по 4 такта каждой темы, сразу с мелодией
      for (const t of themes) {
        override = t;
        bar = 8;
        for (let b = 0; b < 4 && at + barLen() < seconds; b++) {
          scheduleBar(at);
          at += barLen();
        }
      }
      return await off.startRendering();
    }
    // музыка: 16 тактов (с мелодией во второй восьмёрке), потом эффекты по очереди
    bar = 0;
    const music = Math.min(16, Math.floor((seconds - 8) / barLen()));
    for (let b = 0; b < music; b++) scheduleBar(0.1 + b * barLen());
    const sfx: Sfx[] = ['click', 'pop', 'coin', 'gold', 'hit', 'crit', 'miss', 'dice', 'card', 'event', 'unlock', 'level', 'win', 'lose', 'error'];
    const prefs = soundPrefs();
    const was = prefs.sfx;
    prefs.sfx = true;
    const t0 = 0.4 + music * barLen();
    sfx.forEach((s, i) => {
      const at2 = t0 + i * 0.5;
      const realNow = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!;
      // play() считает от currentTime — подставляем нужный момент
      Object.defineProperty(off, 'currentTime', { configurable: true, get: () => at2 });
      play(s);
      Object.defineProperty(off, 'currentTime', realNow);
    });
    prefs.sfx = was;
    return await off.startRendering();
  } finally {
    override = null;
    bar = keepBar;
    engine.swap(keep);
  }
}
