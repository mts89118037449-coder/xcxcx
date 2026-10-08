import { useEffect, useState } from 'react';
import { WEATHER_LOOK, weatherAt, type Weather } from '../../shared/weather.ts';

const W = 360;
const H = 280;

/** Текущая погода; пересчитывается раз в минуту. */
// ?wx=snow|rain|fog|frost — посмотреть погоду, не дожидаясь её (только картинка, на игру не влияет)
const FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('wx') : null;
const forced = (w: Weather): Weather =>
  FORCE && FORCE in WEATHER_LOOK ? { ...w, ...WEATHER_LOOK[FORCE as Weather['kind']], kind: FORCE as Weather['kind'], season: FORCE === 'snow' || FORCE === 'frost' ? 'winter' : w.season, temp: FORCE === 'snow' || FORCE === 'frost' ? -18 : w.temp } : w;

export function useWeather(): Weather {
  const [w, setW] = useState(() => forced(weatherAt(Date.now())));
  useEffect(() => {
    const id = setInterval(() => setW(forced(weatherAt(Date.now()))), 60_000);
    return () => clearInterval(id);
  }, []);
  return w;
}

/** Погода поверх уличной сцены: дождь, снег, туман, иней и сугробы. */
export function WeatherLayer() {
  const w = useWeather();
  const winter = w.season === 'winter';
  return (
    <g pointerEvents="none">
      {winter && <rect y={0} width={W} height={H} fill="#bcd4ec" opacity={0.08} />}
      {w.kind === 'cloudy' && <rect width={W} height={H} fill="#3a4250" opacity={0.18} />}
      {w.kind === 'fog' && (
        <>
          <rect width={W} height={H} fill="#d8dde2" opacity={0.28} />
          {[150, 200].map((y, i) => (
            <rect key={y} className="wx-fog" style={{ animationDelay: `${i * 4}s` }} x={-120} y={y} width={600} height={46} rx={23} fill="#e8ecef" opacity={0.35} filter="url(#sc-blur)" />
          ))}
        </>
      )}
      {w.kind === 'rain' && (
        <>
          <rect width={W} height={H} fill="#2a3440" opacity={0.25} />
          {Array.from({ length: 46 }, (_, i) => (
            <path key={i} className="wx-rain" style={{ animationDelay: `${(i * 0.137) % 0.8}s`, animationDuration: `${0.55 + (i % 4) * 0.08}s` }} d={`M${(i * 53) % 380 - 10},-20 l-5,16`} stroke="#c8d8e8" strokeWidth={1} opacity={0.55} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} className="wx-splash" style={{ animationDelay: `${i * 0.31}s` }} cx={(i * 97) % 340 + 10} cy={250 + (i % 3) * 9} rx={5} ry={1.4} fill="none" stroke="#c8d8e8" strokeWidth={0.7} />
          ))}
        </>
      )}
      {(w.kind === 'snow' || (winter && w.kind !== 'clear' && w.kind !== 'frost')) && (
        <>
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} className="wx-snow" style={{ animationDelay: `${(i * 0.41) % 6}s`, animationDuration: `${5 + (i % 5)}s` }} cx={(i * 37) % 370} cy={-6} r={0.9 + (i % 3) * 0.5} fill="#fff" opacity={0.85} />
          ))}
        </>
      )}
      {w.kind === 'frost' && (
        <>
          <rect width={W} height={H} fill="#cfe4f8" opacity={0.14} />
          {/* иней по краям кадра */}
          <rect width={W} height={H} fill="none" stroke="#eef6ff" strokeWidth={10} opacity={0.35} filter="url(#sc-blur)" />
        </>
      )}
    </g>
  );
}

/** Значок погоды для подписи сцены. */
export function WeatherTag() {
  const w = useWeather();
  return (
    <span className="wx-tag" title={w.effect ?? w.label}>
      {w.emoji} {w.temp > 0 ? '+' : ''}
      {w.temp}°
    </span>
  );
}

/** Земля под погодой: зимой — снег (рисуется под персонажами, а не поверх ног), в дождь — лужи блестят. */
export function WeatherGround() {
  const w = useWeather();
  if (w.season === 'winter')
    return (
      <g pointerEvents="none">
        <rect y={238} width={W} height={42} fill="#e8eef4" opacity={0.6} />
        <path d={`M0,240 ${Array.from({ length: 13 }, (_, i) => `Q${i * 30 + 15},${234 + (i % 3)} ${i * 30 + 30},240`).join(' ')} L360,244 L0,244 Z`} fill="#f4f8fb" opacity={0.75} />
      </g>
    );
  if (w.kind === 'rain')
    return (
      <g pointerEvents="none">
        {[[60, 256, 34], [200, 264, 46], [300, 250, 26]].map(([x, y, r]) => (
          <ellipse key={x} cx={x} cy={y} rx={r} ry={r / 7} fill="#9ab0c4" opacity={0.35} />
        ))}
      </g>
    );
  return null;
}
