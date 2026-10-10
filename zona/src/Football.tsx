import { useEffect, useRef, useState } from 'react';
import { FOOT, ZONES, type KickResult } from '../shared/football.ts';
import { api, startRun } from './api.ts';
import { timeLeft, useGame } from './game.tsx';

type View = Awaited<ReturnType<typeof api.football>>;

/** Карточка «Футбол во дворе» в играх. */
export function FootballCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < FOOT.minLevel) return null;
  return (
    <>
      <button className="tourney-card" onClick={() => setOpen(true)}>
        <span className="tourney-ico">⚽</span>
        <span className="grow">
          <b>Футбол во дворе</b>
          <small>{p.clan ? 'пенальти за клан · матч дня и кубок недели' : 'клан на клан — нужен клан'}</small>
        </span>
        <i>▸</i>
      </button>
      {open && <FootModal onClose={() => setOpen(false)} />}
    </>
  );
}

// центры зон в координатах ворот
const ZX = [70, 150, 230, 70, 150, 230];
const ZY = [48, 48, 48, 100, 100, 100];

function FootModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const [v, setV] = useState<View | null>(null);
  const [mode, setMode] = useState<'menu' | 'aim' | 'replay'>('menu');
  const [kicks, setKicks] = useState<{ zone: number; acc: number }[]>([]);
  const [zone, setZone] = useState<number | null>(null);
  const [power, setPower] = useState(0);
  const powerRef = useRef(0);
  const [res, setRes] = useState<KickResult[]>([]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    api.football().then(setV).catch(() => null);
  }, []);
  // ползунок силы ходит туда-сюда, пока выбрана зона
  useEffect(() => {
    if (zone === null) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      const x = (Math.sin((t - t0) / 260 - Math.PI / 2) + 1) / 2;
      powerRef.current = x;
      setPower(x);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [zone]);
  const start = () => {
    startRun('footShoot');
    setKicks([]);
    setRes([]);
    setShown(0);
    setMode('aim');
  };
  const shoot = async () => {
    if (zone === null) return;
    const next = [...kicks, { zone, acc: powerRef.current }];
    setKicks(next);
    setZone(null);
    if (next.length < FOOT.kicks) return;
    const r = await act<{ res: KickResult[]; goals: number; view: View }>('footShoot', { kicks: next });
    if (!r) return setMode('menu');
    setRes(r.res);
    setMode('replay');
    r.res.forEach((_, i) => setTimeout(() => setShown(i + 1), 900 * (i + 1)));
    setTimeout(() => {
      setV(r.view);
      toast(`⚽ ${r.goals} из ${FOOT.kicks} — в копилку клана`);
    }, 900 * (r.res.length + 1));
  };
  const cur = mode === 'replay' ? res[shown - 1] : null;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {v?.match && (
          <div className="foot-score">
            <span>[{v.match.me.tag}]</span>
            <b>
              {v.match.me.goals} : {v.match.opp ? v.match.opp.goals : '—'}
            </b>
            <span>{v.match.opp ? `[${v.match.opp.tag}]` : 'соперник ждёт'}</span>
            <small>матч дня · голы за сегодня</small>
          </div>
        )}
        <svg className="foot-goal" viewBox="0 0 300 170" onClick={(e) => {
          if (mode !== 'aim' || busy) return;
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 300;
          const y = ((e.clientY - r.top) / r.height) * 170;
          if (y > 130 || x < 30 || x > 270) return;
          if (zone !== null) return shoot();
          setZone((x < 110 ? 0 : x < 190 ? 1 : 2) + (y < 74 ? 0 : 3));
        }}>
          <rect width={300} height={170} fill="#4a7a3a" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={i * 50} y={0} width={25} height={170} fill="#558a44" />
          ))}
          <rect x={30} y={22} width={240} height={108} fill="#ffffff14" />
          {/* сетка */}
          {Array.from({ length: 13 }, (_, i) => (
            <path key={`v${i}`} d={`M${30 + i * 20},22 V130`} stroke="#ffffff30" strokeWidth={0.6} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <path key={`h${i}`} d={`M30,${22 + i * 20} H270`} stroke="#ffffff30" strokeWidth={0.6} />
          ))}
          <path d="M30,130 V22 H270 V130" stroke="#fff" strokeWidth={5} fill="none" />
          <path d="M0,130 H300" stroke="#fff" strokeWidth={2} />
          {mode === 'aim' &&
            Array.from({ length: ZONES }, (_, z) => (
              <rect key={z} x={30 + (z % 3) * 80} y={22 + Math.floor(z / 3) * 54} width={80} height={54} className={`foot-zone ${zone === z ? 'on' : ''}`} />
            ))}
          {/* вратарь */}
          <g className="foot-keeper" style={{ transform: cur ? `translate(${ZX[cur.dive] - 150}px, ${ZY[cur.dive] - 92}px) rotate(${ZX[cur.dive] < 150 ? -50 : ZX[cur.dive] > 150 ? 50 : 0}deg)` : undefined }}>
            <g transform="translate(150 92)">
              <rect x={-11} y={-16} width={22} height={28} rx={4} fill="#e0b030" />
              <circle cy={-24} r={8} fill="#d0a880" />
              <path d="M-11,-12 l-12,-10 M11,-12 l12,-10" stroke="#e0b030" strokeWidth={5} strokeLinecap="round" />
              <circle cx={-24} cy={-23} r={4} fill="#2a2a2a" />
              <circle cx={24} cy={-23} r={4} fill="#2a2a2a" />
              <path d="M-5,12 v20 M5,12 v20" stroke="#222" strokeWidth={5} />
            </g>
          </g>
          {/* мяч */}
          <g key={shown} className={cur ? 'foot-ball fly' : 'foot-ball'} style={cur ? { transform: `translate(${(cur.why === 'over' ? ZX[cur.zone] : ZX[cur.zone]) - 150}px, ${cur.why === 'over' ? -150 : cur.why === 'weak' ? -20 : ZY[cur.zone] - 156}px) scale(0.55)` } : undefined}>
            <circle cx={150} cy={156} r={9} fill="#fff" stroke="#222" />
            <path d="M150,150 l4,3 -2,5 h-4 l-2,-5 Z" fill="#222" />
          </g>
          {cur && (
            <text x={150} y={16} textAnchor="middle" className={`foot-verdict ${cur.goal ? 'goal' : 'miss'}`}>
              {cur.goal ? 'ГОЛ!' : cur.why === 'save' ? 'СЕЙВ' : cur.why === 'over' ? 'ВЫШЕ ВОРОТ' : 'СЛАБО'}
            </text>
          )}
        </svg>
        {mode === 'aim' && (
          <>
            <div className="foot-power">
              <i style={{ left: `${power * 100}%` }} />
              <span className="ok" style={{ left: `${FOOT.missLow * 100}%`, width: `${(FOOT.missHigh - FOOT.missLow) * 100}%` }} />
              <span className="sweet" style={{ left: `${FOOT.sweet[0] * 100}%`, width: `${(FOOT.sweet[1] - FOOT.sweet[0]) * 100}%` }} />
            </div>
            <small className="muted center">
              {zone === null ? 'Тапни угол ворот' : 'Тапни ещё раз — удар (золотая зона в верхний угол — «в девятку»)'} · удар {kicks.length + 1}/{FOOT.kicks}
            </small>
          </>
        )}
        {mode === 'replay' && (
          <div className="foot-dots">
            {res.map((r, i) => (
              <span key={i} className={i < shown ? (r.goal ? 'g' : 'm') : ''}>
                {i < shown ? (r.goal ? '⚽' : '✖') : '·'}
              </span>
            ))}
          </div>
        )}
        {mode !== 'aim' && (
          <button className="btn btn-wide" disabled={busy || !p.clan || (mode === 'replay' && shown < res.length)} onClick={start}>
            {p.clan ? `⚽ Серия пенальти (${FOOT.perDay} в день)` : 'Нужен клан'}
          </button>
        )}
        {v?.claim && (
          <button className="btn btn-wide" disabled={busy} onClick={() => act('footClaim').then((r) => r && (toast('🏆 Награда кубка!'), api.football().then(setV)))}>
            🏆 Кубок прошлой недели: {v.claim.rank + 1}-е место · +{v.claim.gold} 🪙
          </button>
        )}
        {v && (
          <div className="foot-table">
            <b>🏆 Кубок двора · итоги через {timeLeft(v.endsAt - now)}</b>
            {v.table.length === 0 && <small className="muted">Пока никто не бил</small>}
            {v.table.map((r, i) => (
              <div key={r.id} className={r.id === p.clan?.id ? 'me' : ''}>
                <span>{i + 1}.</span>
                <span className="grow">[{r.tag}]</span>
                <small>
                  {r.w}-{r.d}-{r.l} · {r.gf}:{r.ga}
                </small>
                <b>{r.pts}</b>
              </div>
            ))}
            {v.scorers.length > 0 && <small className="muted">Бомбардиры: {v.scorers.map((s) => `${s.name} ${s.goals}`).join(' · ')}</small>}
          </div>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
