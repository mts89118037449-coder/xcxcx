import { useEffect, useRef, useState } from 'react';
import { ARM, BREW, CARDS, DARTS, DICE, RACE, ROACHES } from '../shared/minigames.ts';
import { RigHead } from './art/rig/Rig.tsx';
import { NPC_RIGS } from './art/rig/npcs.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { fmt, lookOf, timeLeft, useGame } from './game.tsx';

export type Mini = 'cards' | 'race' | 'brew' | 'dice' | 'arm' | 'darts';

/** Окно мини-игры: персонаж сверху, игровой стол, кнопки. */
function Table({ who, title, left, children, onClose }: { who: string; title: string; left: string; children: React.ReactNode; onClose(): void }) {
  const npc = useNpc(who);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body mini" onClick={(e) => e.stopPropagation()}>
        <div className="mini-head">
          {npc && <NpcPortrait who={who} className="mini-pic" />}
          <div>
            <b>{title}</b>
            <small>{left}</small>
          </div>
          <button className="mini-x" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ c, hidden }: { c: string; hidden?: boolean }) {
  if (hidden || c === '?') return <div className="pcard back" />;
  const red = c.endsWith('♥') || c.endsWith('♦');
  return (
    <div className={`pcard ${red ? 'red' : ''}`}>
      <b>{c.slice(0, -1)}</b>
      <span>{c.slice(-1)}</span>
    </div>
  );
}

interface CardsState {
  hand: string[];
  dealer: string[];
  sum: number;
  dealerSum: number | null;
  bet: number;
  done: boolean;
  result?: 'win' | 'lose' | 'push' | 'bust';
  money?: number;
}

/** Очко: набери 21 или больше блатного, но не перебери. */
export function CardsGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const max = p.games.cardsMaxBet;
  const bets = [CARDS.minBet, Math.round(max / 4 / 50) * 50, Math.round(max / 2 / 50) * 50, max].filter((b, i, a) => b >= CARDS.minBet && a.indexOf(b) === i);
  const [bet, setBet] = useState(bets[0]);
  const [st, setSt] = useState<CardsState | null>(null);
  const run = async (type: string, body = {}) => {
    const r = await act<CardsState>(type, body);
    if (r) setSt(r);
  };
  const verdict = st?.done
    ? st.result === 'win'
      ? `🏆 Твоя! +${fmt(st.money ?? 0)} ₽`
      : st.result === 'push'
        ? '🤝 Ничья — ставка вернулась'
        : st.result === 'bust'
          ? '💥 Перебор!'
          : '💀 У блатного больше'
    : null;
  return (
    <Table who="sheet/cast/blatnoy" title="🃏 Очко с блатным" left={`партий сегодня: ${p.games.cards}`} onClose={onClose}>
      <div className="felt">
        <div className="hand">
          {st ? st.dealer.map((c, i) => <Card key={i} c={c} />) : [0, 1].map((i) => <Card key={i} c="?" hidden />)}
          {st?.dealerSum != null && <i>{st.dealerSum}</i>}
        </div>
        <div className={`verdict ${st?.result ?? ''}`}>{verdict ?? (st ? `Ставка ${fmt(st.bet)} ₽` : 'Делай ставку')}</div>
        <div className="hand">
          {st ? st.hand.map((c, i) => <Card key={i} c={c} />) : null}
          {st && <i>{st.sum}</i>}
        </div>
      </div>
      {!st || st.done ? (
        <>
          <div className="chips center-chips">
            {bets.map((b) => (
              <button key={b} className={bet === b ? 'active' : ''} onClick={() => setBet(b)}>
                {fmt(b)} ₽
              </button>
            ))}
          </div>
          <button className="btn btn-wide" disabled={busy || p.games.cards <= 0 || p.money < bet} onClick={() => run('cardsStart', { bet })}>
            {p.games.cards <= 0 ? 'Завтра' : 'Раздавай'}
          </button>
        </>
      ) : (
        <div className="row gap">
          <button className="btn btn-wide" disabled={busy} onClick={() => run('cardsHit')}>
            Ещё
          </button>
          <button className="btn btn-wide btn-dark" disabled={busy} onClick={() => run('cardsStand')}>
            Хватит
          </button>
        </div>
      )}
    </Table>
  );
}

/** Тараканьи бега: ставь бычки на таракана и смотри забег. */
export function RaceGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [pick, setPick] = useState(ROACHES[0].id);
  const [bet, setBet] = useState(RACE.bets[0]);
  const [race, setRace] = useState<{ order: string[]; won: boolean; winner: string; butts: number } | null>(null);
  const [go, setGo] = useState(false);
  const start = async () => {
    setGo(false);
    setRace(null);
    const r = await act<{ order: string[]; won: boolean; winner: string; butts: number }>('race', { pick, bet });
    if (!r) return;
    setRace(r);
    requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
  };
  return (
    <Table who="sheet/cast/thin" title="🪳 Тараканьи бега" left={`забегов сегодня: ${p.games.race} · 🚬 ${p.butts}`} onClose={onClose}>
      <div className="track">
        {ROACHES.map((r) => {
          const place = race ? race.order.indexOf(r.id) : -1;
          // первое место доходит до финиша, остальные отстают
          const x = go && place >= 0 ? 88 - place * 14 : 0;
          return (
            <div key={r.id} className={`lane ${pick === r.id ? 'mine' : ''}`} onClick={() => !race && setPick(r.id)}>
              <span className="lane-name">
                {r.name} <small>×{r.payout}</small>
              </span>
              <span className="roach" style={{ left: `${x}%`, transitionDuration: `${2.2 + place * 0.35}s`, color: r.color }}>
                🪳
              </span>
              {go && place === 0 && <span className="lane-win">🏁</span>}
            </div>
          );
        })}
      </div>
      {race && go && (
        <div className={`verdict ${race.won ? 'win' : 'lose'} delay`}>
          {race.won ? `🏆 ${ROACHES.find((x) => x.id === race.winner)!.name} первый! +${race.butts} 🚬` : `💀 Первым пришёл ${ROACHES.find((x) => x.id === race.winner)!.name}`}
        </div>
      )}
      <div className="chips center-chips">
        {RACE.bets.map((b) => (
          <button key={b} className={bet === b ? 'active' : ''} onClick={() => setBet(b)}>
            {b} 🚬
          </button>
        ))}
      </div>
      <button className="btn btn-wide" disabled={busy || p.games.race <= 0 || p.butts < bet} onClick={start}>
        {p.games.race <= 0 ? 'Завтра' : race ? 'Ещё забег' : 'Старт!'}
      </button>
    </Table>
  );
}

/** Чифир: сними кружку с огня, когда закипит — но не перекипит. */
export function BrewGame({ onClose }: { onClose(): void }) {
  const { p, now, act, busy } = useGame();
  const [heat, setHeat] = useState(0);
  const [on, setOn] = useState(false);
  const [res, setRes] = useState<{ energy: number; quality: number } | null>(null);
  const t0 = useRef(0);
  const ZONE = [0.72, 0.86];
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = (t: number) => {
      const h = Math.min(1, (t - t0.current) / 2600);
      setHeat(h);
      if (h >= 1) setOn(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  const light = () => {
    setRes(null);
    setHeat(0);
    t0.current = performance.now();
    setOn(true);
  };
  const take = async () => {
    setOn(false);
    const mid = (ZONE[0] + ZONE[1]) / 2;
    const q = heat >= ZONE[0] && heat <= ZONE[1] ? 1 : Math.max(0, 1 - Math.abs(heat - mid) / 0.4);
    const r = await act<{ energy: number; quality: number }>('brew', { quality: q });
    if (r) setRes(r);
  };
  const wait = p.games.brewReadyAt > now;
  return (
    <Table who="sheet/cast/bandaged" title="☕ Сварить чифир" left={`варок сегодня: ${p.games.brew} · до ${BREW.maxEnergy} ⚡`} onClose={onClose}>
      <div className="brew">
        <div className="brew-mug" style={{ ['--h' as string]: heat }}>
          <div className="brew-tea" />
          {heat > 0.5 && <div className="brew-steam" style={{ opacity: heat }} />}
          {heat > 0.9 && <div className="brew-boil">🔥</div>}
        </div>
        <div className="brew-bar">
          <div className="brew-zone" style={{ left: `${ZONE[0] * 100}%`, width: `${(ZONE[1] - ZONE[0]) * 100}%` }} />
          <div className="brew-mark" style={{ left: `${heat * 100}%` }} />
        </div>
        {res && <div className={`verdict ${res.quality > 0.8 ? 'win' : ''}`}>{res.quality > 0.8 ? `Идеальный! +${res.energy} ⚡` : `Так себе. +${res.energy} ⚡`}</div>}
      </div>
      {on ? (
        <button className="btn btn-wide btn-red" onClick={take}>
          Снять с огня!
        </button>
      ) : (
        <button className="btn btn-wide" disabled={busy || p.games.brew <= 0 || wait} onClick={light}>
          {p.games.brew <= 0 ? 'Завтра' : wait ? `Кипятильник остывает ${timeLeft(p.games.brewReadyAt - now)}` : 'Поставить кипятильник'}
        </button>
      )}
    </Table>
  );
}

/** Кубик: точки по раскладу грани. */
function Die({ v, rolling }: { v: number; rolling?: boolean }) {
  const P: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
    6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
  };
  return (
    <svg className={`die ${rolling ? 'rolling' : ''}`} viewBox="0 0 100 100" width={54} height={54}>
      <rect x={4} y={4} width={92} height={92} rx={18} fill="#f2ece0" stroke="#1b130d" strokeWidth={5} />
      <rect x={10} y={10} width={80} height={30} rx={12} fill="#fff" opacity={0.5} />
      {P[v]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={9} fill={v === 1 ? '#b83a3a' : '#1b130d'} />)}
    </svg>
  );
}

/** Кости: ставка деньгами, по два кубика, у кого больше. */
export function DiceGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const max = p.games.diceMaxBet;
  const bets = [DICE.minBet, Math.round(max / 4 / 50) * 50, Math.round(max / 2 / 50) * 50, max].filter((b, i, a) => b >= DICE.minBet && a.indexOf(b) === i);
  const [bet, setBet] = useState(bets[0]);
  const [res, setRes] = useState<{ me: number[]; him: number[]; result: 'win' | 'lose'; money: number } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState([3, 5, 2, 6]);
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace([1, 2, 3, 4].map(() => 1 + Math.floor(Math.random() * 6))), 80);
    return () => clearInterval(id);
  }, [rolling]);
  const roll = async () => {
    setRes(null);
    setRolling(true);
    const [r] = await Promise.all([act<{ me: number[]; him: number[]; result: 'win' | 'lose'; money: number }>('dice', { bet }), new Promise((ok) => setTimeout(ok, 750))]);
    setRolling(false);
    if (r) setRes(r);
  };
  const show = res && !rolling ? [...res.him, ...res.me] : face;
  return (
    <Table who="sheet/cast/gypsy" title="🎲 Кости с цыганом" left={`бросков сегодня: ${p.games.dice}`} onClose={onClose}>
      <div className="felt dice-felt">
        <div className="hand">
          <Die v={show[0]} rolling={rolling} />
          <Die v={show[1]} rolling={rolling} />
          {res && !rolling && <i>{res.him[0] + res.him[1]}</i>}
        </div>
        <div className={`verdict ${res?.result ?? ''}`}>
          {res && !rolling
            ? res.result === 'win'
              ? `🏆 Твоя! +${fmt(res.money)} ₽${res.me[0] === res.me[1] ? ' · дубль ×3' : ''}`
              : res.me[0] + res.me[1] === res.him[0] + res.him[1]
                ? '🤝 Поровну — а ничья за цыганом'
                : '💀 У цыгана больше'
            : rolling
              ? 'Трясёт в кружке…'
              : 'Делай ставку'}
        </div>
        <div className="hand">
          <Die v={show[2]} rolling={rolling} />
          <Die v={show[3]} rolling={rolling} />
          {res && !rolling && <i>{res.me[0] + res.me[1]}</i>}
        </div>
      </div>
      <div className="chips center-chips">
        {bets.map((b) => (
          <button key={b} className={bet === b ? 'active' : ''} onClick={() => setBet(b)}>
            {fmt(b)} ₽
          </button>
        ))}
      </div>
      <button className="btn btn-wide" disabled={busy || rolling || p.games.dice <= 0 || p.money < bet} onClick={roll}>
        {p.games.dice <= 0 ? 'Завтра' : 'Бросить кости'}
      </button>
    </Table>
  );
}

/** Армрестлинг: жми кнопку быстрее, чем соперник давит. */
export function ArmGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [rival, setRival] = useState(ARM.rivals[0].id);
  const r = ARM.rivals.find((x) => x.id === rival)!;
  const [phase, setPhase] = useState<'pick' | 'go' | 'done'>('pick');
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(ARM.seconds);
  const [res, setRes] = useState<{ won: boolean; power: number; need: number; xp: number; butts: number } | null>(null);
  const t0 = useRef(0);
  const tapsRef = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (phase !== 'go') return;
    let raf = 0;
    const tick = () => {
      const el = (performance.now() - t0.current) / 1000;
      setLeft(Math.max(0, ARM.seconds - el));
      force((x) => x + 1);
      if (el >= ARM.seconds) {
        setPhase('done');
        act<{ won: boolean; power: number; need: number; xp: number; butts: number }>('arm', { rival, taps: tapsRef.current }).then((x) => x && setRes(x));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, act, rival]);
  const start = () => {
    setRes(null);
    setTaps(0);
    tapsRef.current = 0;
    t0.current = performance.now();
    setPhase('go');
  };
  const tap = () => {
    if (phase !== 'go') return;
    tapsRef.current++;
    setTaps(tapsRef.current);
  };
  // перевес: мой нажим против равномерного давления соперника
  const el = phase === 'go' ? ARM.seconds - left : ARM.seconds;
  const mine = taps + p.str * 0.25;
  const his = (r.need * el) / ARM.seconds;
  const lean = res ? (res.won ? -62 : 62) : Math.max(-62, Math.min(62, ((his - mine) / r.need) * 140));
  const rivalLook = NPC_RIGS[r.who]?.look;
  return (
    <Table who={r.who} title="💪 Армрестлинг" left={`схваток сегодня: ${p.games.arm}`} onClose={onClose}>
      {phase === 'pick' && (
        <div className="chips center-chips">
          {ARM.rivals.map((x) => (
            <button key={x.id} className={rival === x.id ? 'active' : ''} onClick={() => setRival(x.id)}>
              {x.name} · ⭐{x.xp} 🚬{x.butts}
            </button>
          ))}
        </div>
      )}
      <div className="arm-table" onPointerDown={tap}>
        <div className="arm-face">{<RigHead look={lookOf(p)} size={64} />}<b>Ты</b></div>
        <svg viewBox="-60 -70 120 90" className="arm-svg">
          <rect x={-58} y={8} width={116} height={12} rx={3} fill="#5a3c24" stroke="#1b130d" strokeWidth={2} />
          {(() => {
            // сцепленные кисти ходят по дуге над столом; локти стоят на месте
            const hx = -Math.sin((lean * Math.PI) / 180) * 40;
            const hy = 10 - Math.cos((lean * Math.PI) / 180) * 40;
            return (
              <g>
                <path d={`M -34,12 L ${hx - 3},${hy + 3}`} stroke="#1b130d" strokeWidth={15} strokeLinecap="round" />
                <path d={`M -34,12 L ${hx - 3},${hy + 3}`} stroke="#d9a888" strokeWidth={11} strokeLinecap="round" />
                <path d={`M 34,12 L ${hx + 3},${hy + 3}`} stroke="#1b130d" strokeWidth={15} strokeLinecap="round" />
                <path d={`M 34,12 L ${hx + 3},${hy + 3}`} stroke="#c68c62" strokeWidth={11} strokeLinecap="round" />
                <circle cx={hx} cy={hy} r={9} fill="#d0a080" stroke="#1b130d" strokeWidth={2.4} />
              </g>
            );
          })()}
        </svg>
        <div className="arm-face">{rivalLook && <RigHead look={rivalLook} size={64} className="flip" />}<b>{r.name}</b></div>
      </div>
      {phase === 'go' && (
        <div className="arm-go">
          <b>{left.toFixed(1)} с</b> · нажатий: {taps}
        </div>
      )}
      {res && <div className={`verdict ${res.won ? 'win' : 'lose'}`}>{res.won ? `🏆 Положил! +${res.xp} ⭐ +${res.butts} 🚬` : `💀 Не дожал: ${res.power} против ${res.need}`}</div>}
      {phase === 'go' ? (
        <button className="btn btn-wide btn-red arm-mash" onPointerDown={(e) => { e.preventDefault(); tap(); }}>
          ЖМИ! 💪
        </button>
      ) : (
        <button className="btn btn-wide" disabled={busy || p.games.arm <= 0} onClick={start}>
          {p.games.arm <= 0 ? 'Завтра' : phase === 'done' ? 'Ещё схватка' : `Сцепились! (${ARM.seconds} с)`}
        </button>
      )}
    </Table>
  );
}

/** Заточка в мишень: прицел гуляет, бросай, когда он в центре. */
export function DartsGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [hits, setHits] = useState<{ x: number; y: number; acc: number }[]>([]);
  const [res, setRes] = useState<{ points: number[]; score: number; butts: number } | null>(null);
  const [on, setOn] = useState(false);
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const t0 = useRef(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = (t: number) => {
      const s = (t - t0.current) / 1000;
      const k = 1 + hits.length * 0.35; // каждый бросок прицел гуляет быстрее
      setAim({ x: Math.sin(s * 2.3 * k) * 40 + Math.sin(s * 5.1) * 6, y: Math.cos(s * 1.7 * k) * 34 + Math.sin(s * 4.3) * 5 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, hits.length]);
  const start = () => {
    setHits([]);
    setRes(null);
    t0.current = performance.now();
    setOn(true);
  };
  const throwIt = async () => {
    const acc = Math.max(0, 1 - Math.hypot(aim.x, aim.y) / 46);
    const next = [...hits, { ...aim, acc }];
    setHits(next);
    if (next.length < DARTS.throws) return;
    setOn(false);
    const r = await act<{ points: number[]; score: number; butts: number }>('darts', { accs: next.map((h) => h.acc) });
    if (r) setRes(r);
  };
  return (
    <Table who="sheet/cast/spetsnaz" title="🎯 Заточка в мишень" left={`подходов сегодня: ${p.games.darts}`} onClose={onClose}>
      <svg viewBox="-55 -55 110 110" className="darts-board">
        <circle r={50} fill="#3a2a1c" stroke="#1b130d" strokeWidth={3} />
        {[46, 36, 25, 14, 6].map((rr, i) => (
          <circle key={rr} r={rr} fill={i % 2 ? '#e8dcc0' : '#2a2420'} stroke="#1b130d" strokeWidth={1} />
        ))}
        <circle r={6} fill="#b83a3a" />
        {hits.map((h, i) => (
          <g key={i} transform={`translate(${h.x} ${h.y}) rotate(-30)`}>
            <path d="M 0,0 L 14,-2 L 14,2 Z" fill="#c8ccd2" stroke="#1b130d" strokeWidth={0.6} />
            <rect x={14} y={-1.6} width={9} height={3.2} fill="#3a2a1c" />
          </g>
        ))}
        {on && (
          <g transform={`translate(${aim.x} ${aim.y})`}>
            <circle r={5} fill="none" stroke="#ffe066" strokeWidth={1.4} />
            <path d="M -9,0 H -3 M 3,0 H 9 M 0,-9 V -3 M 0,3 V 9" stroke="#ffe066" strokeWidth={1.4} />
          </g>
        )}
      </svg>
      <div className={`verdict ${res && res.butts > 0 ? 'win' : ''}`}>
        {res ? `${res.points.join(' + ')} = ${res.score} очков · +${res.butts} 🚬` : on ? `Бросок ${hits.length + 1} из ${DARTS.throws}` : 'Три броска — очки идут в бычки'}
      </div>
      {on ? (
        <button className="btn btn-wide btn-red" onClick={throwIt}>
          Бросить 🗡️
        </button>
      ) : (
        <button className="btn btn-wide" disabled={busy || p.games.darts <= 0} onClick={start}>
          {p.games.darts <= 0 ? 'Завтра' : res ? 'Ещё подход' : 'Встать к мишени'}
        </button>
      )}
    </Table>
  );
}
