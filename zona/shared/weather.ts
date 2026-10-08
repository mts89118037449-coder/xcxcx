// Погода на зоне: одна на всех, меняется раз в 6 часов, зависит от времени года (по Москве).
// Считается и на сервере, и в клиенте одинаково — без запросов.

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'frost' | 'fog';

export interface Weather {
  season: Season;
  kind: WeatherKind;
  temp: number;
  emoji: string;
  label: string;
  /** чем погода отзывается в игре — одной строкой */
  effect: string | null;
}

const H = 3600_000;

/** Детерминированный «случай» для отрезка времени. */
function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

export function seasonOf(now: number): Season {
  const m = new Date(now + 3 * H).getUTCMonth();
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

const TABLE: Record<Season, { kinds: [WeatherKind, number][]; temp: [number, number] }> = {
  winter: { kinds: [['snow', 0.4], ['frost', 0.3], ['cloudy', 0.2], ['clear', 0.1]], temp: [-28, -6] },
  spring: { kinds: [['clear', 0.35], ['cloudy', 0.3], ['rain', 0.25], ['fog', 0.1]], temp: [-2, 14] },
  summer: { kinds: [['clear', 0.6], ['cloudy', 0.2], ['rain', 0.15], ['fog', 0.05]], temp: [14, 30] },
  autumn: { kinds: [['rain', 0.4], ['cloudy', 0.3], ['fog', 0.15], ['clear', 0.15]], temp: [-4, 12] },
};

export const WEATHER_LOOK: Record<WeatherKind, { emoji: string; label: string; effect: string | null }> = {
  clear: { emoji: '☀️', label: 'ясно', effect: null },
  cloudy: { emoji: '☁️', label: 'пасмурно', effect: null },
  rain: { emoji: '🌧️', label: 'дождь', effect: 'в дождь бежать легче: следы смывает' },
  fog: { emoji: '🌫️', label: 'туман', effect: 'в тумане вышки слепые: бежать легче' },
  snow: { emoji: '🌨️', label: 'снег', effect: 'по снегу остаются следы: бежать труднее, в ШИЗО холодно' },
  frost: { emoji: '🥶', label: 'мороз', effect: 'мороз: в ШИЗО холоднее, бежать труднее' },
};

export function weatherAt(now: number): Weather {
  const season = seasonOf(now);
  const block = Math.floor((now + 3 * H) / (6 * H));
  const t = TABLE[season];
  let r = hash(block);
  let kind: WeatherKind = t.kinds[0][0];
  for (const [k, w] of t.kinds) {
    if ((r -= w) < 0) {
      kind = k;
      break;
    }
  }
  // ночью холоднее, мороз — ещё ниже
  const hour = new Date(now + 3 * H).getUTCHours();
  const night = hour >= 22 || hour < 6;
  const temp = Math.round(t.temp[0] + hash(block + 7919) * (t.temp[1] - t.temp[0]) - (night ? 5 : 0) - (kind === 'frost' ? 8 : 0));
  return { season, kind, temp, ...WEATHER_LOOK[kind] };
}

/** Влияние погоды на игру. */
export function weatherFx(w: Weather) {
  return {
    /** к шансу пройти этап побега */
    escape: w.kind === 'rain' || w.kind === 'fog' ? 0.05 : w.kind === 'snow' || w.kind === 'frost' ? -0.05 : 0,
    /** лишняя потеря тепла в ШИЗО за ночь */
    shizoCold: w.kind === 'frost' || w.temp < -18 ? 1 : 0,
  };
}
