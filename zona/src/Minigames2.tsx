import { useEffect, useRef, useState } from 'react';
import { matById, type MatId } from '../shared/craft.ts';
import { BEADS, BELT, CHESS, FISH, NARDY, SHIZO, SPEED, nardyLand, nardyStep, puzzleById, shizoCardById, type NardyPick } from '../shared/minigames2.ts';
import { LocationScene } from './art/Locations.tsx';
import { Place } from './art/Scenes.tsx';
import { PoseG } from './art/sprites.tsx';
import { consumableById } from '../shared/perks.ts';
import { Table } from './Minigames.tsx';
import { fmt, lookOf, timeLeft, useGame } from './game.tsx';
import { startRun } from './api.ts';

/** Выбор ставки перед партией. */
function Bets({ max, onBet, disabled }: { max: number; onBet(b: number): void; disabled: boolean }) {
  const opts = [...new Set([50, Math.round(max / 4 / 10) * 10, Math.round(max / 2 / 10) * 10, max])].filter((x) => x >= 50);
  return (
    <div className="bets">
      {opts.map((b) => (
        <button key={b} className="btn btn-s" disabled={disabled} onClick={() => onBet(b)}>
          {fmt(b)} ₽
        </button>
      ))}
    </div>
  );
}

export const Die = ({ v }: { v: number }) => <span className="die2">{'⚀⚁⚂⚃⚄⚅'[v - 1]}</span>;

// --- Нарды ---------------------------------------------------------------------------------

/** Доска нард: 25 клеток змейкой в два ряда, ⚪ — ты, ⚫ — соперник. */
export function NardyBoard({ me, him }: { me: number; him: number }) {
  const cell = (i: number) => {
    const row = i <= 12 ? 1 : 0;
    const col = i <= 12 ? i : 24 - i;
    return { x: 12 + col * 22.3, y: 22 + row * 44 };
  };
  return (
    <svg viewBox="0 0 300 92" className="nardy-board">
        <rect width={300} height={92} rx={8} fill="#6a3f1e" />
        <rect x={4} y={4} width={292} height={84} rx={6} fill="#c9a06a" />
        {Array.from({ length: 25 }, (_, i) => {
          const c = cell(i);
          const trap = NARDY.traps.includes(i);
          const bridge = NARDY.bridges.includes(i);
          return (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={9} fill={i === 24 ? '#e8c34a' : trap ? '#b33a32' : bridge ? '#3a8a4a' : i % 2 ? '#8a5a2e' : '#e9dcc0'} stroke="#4a2a10" strokeWidth={0.8} />
              <text x={c.x} y={c.y + 3} fontSize={7} textAnchor="middle" fill={trap || bridge || i % 2 ? '#fff' : '#4a2a10'}>
                {i === 24 ? '🏠' : trap ? '⛓' : bridge ? '↗' : i}
              </text>
            </g>
          );
        })}
        <circle cx={cell(him).x + 4} cy={cell(him).y - 5} r={5.5} fill="#1a1a1a" stroke="#888" className="nardy-piece" />
        <circle cx={cell(me).x - 4} cy={cell(me).y + 5} r={5.5} fill="#f4f1ea" stroke="#333" className="nardy-piece" />
      </svg>
  );
}

export function NardyGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const g = p.tables.nardy;
  const [res, setRes] = useState<{ result: 'win' | 'lose'; money: number; me: number; him: number } | null>(null);
  const start = async (bet: number) => {
    setRes(null);
    await act('nardyStart', { bet });
  };
  const move = async (pick: NardyPick) => {
    const r = await act<{ state: { me: number; him: number }; result: 'win' | 'lose' | null; money: number }>('nardyMove', { pick });
    if (r?.result) setRes({ result: r.result, money: r.money, me: r.state.me, him: r.state.him });
  };
  const me = g?.me ?? res?.me ?? 0;
  const him = g?.him ?? res?.him ?? 0;
  return (
    <Table who="sheet/cast/gypsy" title="🎲 Нарды с цыганом" left={`партий сегодня: ${p.games.nardy} · до ${NARDY.finish} клетки`} onClose={onClose}>
      <NardyBoard me={me} him={him} />
      <div className="muted small center">⛓ ловушка — назад на {NARDY.trapBack} · ↗ мостик — вперёд на {NARDY.bridgeFwd} · ⚪ ты, ⚫ цыган</div>
      {g ? (
        <>
          <div className="nardy-roll">
            {g.hisLast && (
              <span className="muted small">
                цыган: <Die v={g.hisLast[0]} />
                <Die v={g.hisLast[1]} />
              </span>
            )}
            <span>
              тебе: <Die v={g.dice[0]} />
              <Die v={g.dice[1]} />
            </span>
          </div>
          <div className="nardy-picks">
            {(['a', 'b', 'sum'] as NardyPick[]).map((k) => {
              const to = nardyLand(g.me, nardyStep(g.dice, k));
              return (
                <button key={k} className="btn btn-s" disabled={busy} onClick={() => move(k)}>
                  {k === 'sum' ? `${g.dice[0]}+${g.dice[1]}` : g.dice[k === 'a' ? 0 : 1]} → {to === 24 ? '🏠' : to}
                  {NARDY.traps.includes(Math.min(24, g.me + nardyStep(g.dice, k))) ? ' ⛓' : ''}
                </button>
              );
            })}
          </div>
          <div className="muted small center">Ставка {fmt(g.bet)} ₽ · выигрыш ×{NARDY.payout}</div>
        </>
      ) : (
        <>
          {res && <div className={`verdict ${res.result}`}>{res.result === 'win' ? `Дома первым! +${fmt(res.money)} ₽` : 'Цыган пришёл первым'}</div>}
          <Bets max={p.games.tableMaxBet} disabled={busy || p.games.nardy <= 0} onBet={start} />
          {p.games.nardy <= 0 && <div className="muted small center">Завтра</div>}
        </>
      )}
    </Table>
  );
}

// --- Домино ----------------------------------------------------------------------------------

function Bone({ t, small, on, onClick }: { t: [number, number]; small?: boolean; on?: boolean; onClick?: () => void }) {
  // точки как на настоящей кости: сетка 3×3
  const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  const dots = (n: number) => (
    <span className="bone-half">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={PIPS[n].includes(i) ? '' : 'off'} />
      ))}
    </span>
  );
  return (
    <button className={`bone ${small ? 'small' : ''} ${on ? 'on' : ''}`} onClick={onClick} disabled={!onClick}>
      {dots(t[0])}
      {dots(t[1])}
    </button>
  );
}

export function DominoGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const d = p.tables.domino;
  const [end, setEnd] = useState<{ result: 'win' | 'lose'; money: number } | null>(null);
  const start = async (bet: number) => {
    setEnd(null);
    await act('dominoStart', { bet });
  };
  const move = async (index: number, side: 'l' | 'r') => {
    const r = await act<{ end: { result: 'win' | 'lose'; money: number } | null }>('dominoMove', { index, side });
    if (r?.end) setEnd(r.end);
  };
  const l = d?.chain[0][0];
  const r = d ? d.chain[d.chain.length - 1][1] : undefined;
  const playable = (t: [number, number]) => t[0] === l || t[1] === l || t[0] === r || t[1] === r;
  const canPlay = !!d && d.hand.some(playable);
  const chain = d ? (d.chain.length > 7 ? d.chain.slice(-7) : d.chain) : [];
  return (
    <Table who="sheet/cast/oldman" title="🁫 Домино со стариком" left={`партий сегодня: ${p.games.domino}`} onClose={onClose}>
      {d ? (
        <>
          <div className="domino-top">
            <span>🂠 у старика: {d.ai.length}</span>
            <span>базар: {d.bone.length}</span>
          </div>
          <div className="domino-chain">
            <b className="domino-end">{l}</b>
            {d.chain.length > 7 && <span className="muted">…</span>}
            {chain.map((t, i) => (
              <Bone key={i} t={t} small />
            ))}
            <b className="domino-end">{r}</b>
          </div>
          <div className="muted small center">Старик {d.last}</div>
          <div className="domino-hand">
            {d.hand.map((t, i) => {
              const okL = t[0] === l || t[1] === l;
              const okR = t[0] === r || t[1] === r;
              return (
                <div key={i} className="domino-slot">
                  <Bone t={t} on={okL || okR} onClick={okL || okR ? () => move(i, okR ? 'r' : 'l') : undefined} />
                  {okL && okR && l !== r && (
                    <button className="bone-side" disabled={busy} onClick={() => move(i, 'l')}>
                      ◀ влево
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!canPlay && (
            <button className="btn btn-wide btn-dark" disabled={busy} onClick={() => move(-1, 'r')}>
              {d.bone.length ? 'Взять из базара' : 'Пропустить ход'}
            </button>
          )}
        </>
      ) : (
        <>
          {end && <div className={`verdict ${end.result}`}>{end.result === 'win' ? `Отдуплился! +${fmt(end.money)} ₽` : 'Старик закончил первым'}</div>}
          <div className="muted small center">Выкладывай кости к концам цепочки. Кто первый пустой — забирает ставку ×2.</div>
          <Bets max={p.games.tableMaxBet} disabled={busy || p.games.domino <= 0} onBet={start} />
        </>
      )}
    </Table>
  );
}

// --- Шахматный этюд --------------------------------------------------------------------------

const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export function ChessGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [id, setId] = useState<string | null>(p.tables.chess ?? null);
  const [sel, setSel] = useState<string | null>(null);
  const [res, setRes] = useState<{ ok: boolean; xp: number; butts: number } | null>(null);
  const [last, setLast] = useState<[string, string] | null>(null);
  const pz = id ? puzzleById.get(id) : null;
  const take = async () => {
    setRes(null);
    setLast(null);
    const r = await act<{ id: string }>('chessPuzzle');
    if (r) setId(r.id);
  };
  const tap = async (sq: string) => {
    if (!pz || res) return;
    const pc = pz.pieces[sq];
    if (pc && pc === pc.toUpperCase()) return setSel(sq);
    if (!sel) return;
    setLast([sel, sq]);
    const r = await act<{ ok: boolean; xp: number; butts: number }>('chessSolve', { from: sel, to: sq });
    setSel(null);
    if (r) {
      setRes(r);
      setId(null);
    }
  };
  const board = pz ? { ...pz.pieces } : {};
  if (last && board[last[0]]) {
    board[last[1]] = board[last[0]];
    delete board[last[0]];
  }
  return (
    <Table who="sheet/cast/oldman" title="♟️ Шахматный этюд" left={`этюдов сегодня: ${p.games.chess} · мат в один ход`} onClose={onClose}>
      {pz || res ? (
        <>
          <div className="muted small center">{pz ? `«${pz.name}»: белые начинают и ставят мат` : ''}</div>
          <div className="chess">
            {Array.from({ length: 64 }, (_, i) => {
              const f = i % 8;
              const rk = 7 - Math.floor(i / 8);
              const sq = `${'abcdefgh'[f]}${rk + 1}`;
              const pc = board[sq];
              return (
                <button key={sq} className={`sq ${(f + rk) % 2 ? 'light' : 'dark'} ${sel === sq ? 'sel' : ''} ${last && last[1] === sq ? 'last' : ''}`} onClick={() => tap(sq)}>
                  {pc && <span className={pc === pc.toUpperCase() ? 'w' : 'b'}>{GLYPH[pc]}</span>}
                  {f === 0 && <i className="rk">{rk + 1}</i>}
                  {rk === 0 && <i className="fl">{'abcdefgh'[f]}</i>}
                </button>
              );
            })}
          </div>
          {res && <div className={`verdict ${res.ok ? 'win' : 'lose'}`}>{res.ok ? `Мат! +${res.xp} ⭐ +${res.butts} 🚬` : 'Не мат. Профессор качает головой'}</div>}
          {res && (
            <button className="btn btn-wide" disabled={busy || p.games.chess <= 0} onClick={take}>
              {p.games.chess <= 0 ? 'Завтра' : 'Следующий этюд'}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="muted small center">Профессор расставляет позицию: найди мат в один ход. Любой матующий ход засчитывается.</div>
          <div className="muted small center">
            Награда: {CHESS.xp}+ ⭐ и {CHESS.butts} 🚬
          </div>
          <button className="btn btn-wide" disabled={busy || p.games.chess <= 0} onClick={take}>
            {p.games.chess <= 0 ? 'Завтра' : 'Взять этюд'}
          </button>
        </>
      )}
    </Table>
  );
}

// --- Чифир на скорость -------------------------------------------------------------------------

export function SpeedGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [phase, setPhase] = useState<'idle' | 'wait' | 'boil'>('idle');
  const [res, setRes] = useState<{ butts: number; ms: number; early?: boolean } | null>(null);
  const boilAt = useRef(0);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = async () => {
    setRes(null);
    setPhase('wait');
    // когда закипит — решает сервер, чтобы не подгадать
    const r = await startRun('speed');
    const delay = r?.delay ?? 1400 + Math.random() * 2600;
    timer.current = window.setTimeout(() => {
      boilAt.current = performance.now();
      setPhase('boil');
    }, delay);
  };
  const grab = async () => {
    clearTimeout(timer.current);
    const early = phase === 'wait';
    const ms = early ? 0 : performance.now() - boilAt.current;
    setPhase('idle');
    const r = await act<{ butts: number; ms: number }>('speed', { ms });
    if (r) setRes({ ...r, early });
  };
  return (
    <Table who="sheet/cast/bandaged" title="⚡ Чифир на скорость" left={`попыток сегодня: ${p.games.speed}`} onClose={onClose}>
      <button className={`speed-mug ${phase}`} disabled={phase === 'idle'} onClick={grab}>
        <span>{phase === 'boil' ? '♨️' : '☕'}</span>
        <b>{phase === 'boil' ? 'ХВАТАЙ!' : phase === 'wait' ? 'жди, пока закипит…' : ''}</b>
      </button>
      {res && (
        <div className={`verdict ${res.butts ? 'win' : 'lose'}`}>
          {res.early ? 'Фальстарт — обжёгся!' : `${res.ms} мс · ${res.butts ? `+${res.butts} 🚬` : 'медленно'}`}
        </div>
      )}
      <div className="muted small center">Быстрее {SPEED.tiers[0].ms} мс — {SPEED.tiers[0].butts} 🚬. Схватишь раньше — обожжёшься.</div>
      {phase === 'idle' && (
        <button className="btn btn-wide" disabled={busy || p.games.speed <= 0} onClick={start}>
          {p.games.speed <= 0 ? 'Завтра' : 'Поставить кружку'}
        </button>
      )}
    </Table>
  );
}

// --- Конвейер ------------------------------------------------------------------------------------

interface BeltItem {
  id: number;
  bad: boolean;
  born: number;
  gone?: 'ok' | 'err';
}

export function ConveyorGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [items, setItems] = useState<BeltItem[]>([]);
  const [now, setNow] = useState(0);
  const [on, setOn] = useState(false);
  const [res, setRes] = useState<{ money: number; good: number; missed: number; rep: number } | null>(null);
  const t0 = useRef(0);
  const score = useRef({ good: 0, missed: 0 });
  const TRAVEL = 3200; // мс от края до края
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let spawned = 0;
    const tick = (t: number) => {
      const el = t - t0.current;
      setNow(el);
      // новая коробка раз в ~0.65 с
      if (el < BELT.seconds * 1000 && el > spawned * 650 && spawned < BELT.maxItems) {
        spawned++;
        setItems((a) => [...a, { id: spawned, bad: Math.random() < 0.32, born: el }]);
      }
      // доехали до конца
      setItems((a) =>
        a.map((it) => {
          if (it.gone || el - it.born < TRAVEL) return it;
          if (it.bad) score.current.missed++;
          else score.current.good++;
          return { ...it, gone: it.bad ? 'err' : 'ok' };
        }),
      );
      if (el < BELT.seconds * 1000 + TRAVEL) raf = requestAnimationFrame(tick);
      else setOn(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  useEffect(() => {
    if (on || !t0.current || res) return;
    act<{ money: number; good: number; missed: number; rep: number }>('conveyor', score.current).then((r) => r && setRes(r));
  }, [on]);
  const start = () => {
    setItems([]);
    setRes(null);
    score.current = { good: 0, missed: 0 };
    t0.current = performance.now();
    startRun('conveyor');
    setOn(true);
  };
  const hit = (it: BeltItem) => {
    if (it.gone) return;
    if (it.bad) score.current.good++;
    else score.current.missed++;
    setItems((a) => a.map((x) => (x.id === it.id ? { ...x, gone: it.bad ? 'ok' : 'err' } : x)));
  };
  return (
    <Table who="sheet/cast/coverall" title="📦 Конвейер" left={`смен сегодня: ${p.games.conveyor} · ${BELT.seconds} секунд`} onClose={onClose}>
      <div className="belt">
        <div className="belt-line" style={{ backgroundPositionX: `${(now / 12) % 40}px` }} />
        {items
          .filter((it) => !it.gone || now - it.born < TRAVEL + 400)
          .map((it) => (
            <button
              key={it.id}
              className={`belt-item ${it.bad ? 'bad' : ''} ${it.gone ?? ''}`}
              style={{ left: `${Math.min(100, ((now - it.born) / TRAVEL) * 100)}%` }}
              onPointerDown={() => hit(it)}
            >
              {it.bad ? '🥾' : '🧤'}
            </button>
          ))}
      </div>
      <div className="muted small center">Рукавицы 🧤 пропускай, дырявый сапог 🥾 — жми, чтобы снять с ленты. Ошибки штрафуют.</div>
      {on && <div className="verdict">⏱ {Math.max(0, Math.ceil(BELT.seconds - now / 1000))} · ✔ {score.current.good} · ✖ {score.current.missed}</div>}
      {res && <div className={`verdict ${res.money ? 'win' : 'lose'}`}>✔ {res.good} · ✖ {res.missed} · +{fmt(res.money)} ₽{res.rep ? ` · ⚒️ +${res.rep}` : ''}</div>}
      {!on && (
        <button className="btn btn-wide" disabled={busy || p.games.conveyor <= 0} onClick={start}>
          {p.games.conveyor <= 0 ? 'Завтра' : 'Встать к ленте'}
        </button>
      )}
    </Table>
  );
}

// --- Чётки -----------------------------------------------------------------------------------------

export function BeadsGame({ onClose }: { onClose(): void }) {
  const { p, act, busy, now: clock } = useGame();
  const [angle, setAngle] = useState(0);
  const [on, setOn] = useState(false);
  const [accs, setAccs] = useState<number[]>([]);
  const [res, setRes] = useState<{ quality: number; energy: number; xp: number } | null>(null);
  const t0 = useRef(0);
  const STEP = 36; // 10 бусин
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = (t: number) => {
      const s = (t - t0.current) / 1000;
      setAngle(s * (70 + accs.length * 9)); // каждая бусина чуть быстрее
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, accs.length]);
  const start = () => {
    setAccs([]);
    setRes(null);
    t0.current = performance.now();
    startRun('beads');
    setOn(true);
  };
  const tap = async () => {
    const off = ((angle % STEP) + STEP) % STEP;
    const acc = 1 - Math.min(off, STEP - off) / (STEP / 2);
    const next = [...accs, acc];
    setAccs(next);
    if (next.length < BEADS.beads) return;
    setOn(false);
    const r = await act<{ quality: number; energy: number; xp: number }>('beads', { accs: next });
    if (r) setRes(r);
  };
  const wait = p.games.beadsReadyAt > clock;
  return (
    <Table who="sheet/cast/priest" title="📿 Чётки" left={`перебираний сегодня: ${p.games.beads}`} onClose={onClose}>
      <svg viewBox="-60 -60 120 120" className="beads" onPointerDown={on ? tap : undefined}>
        <circle r={42} fill="none" stroke="#5a3a1a" strokeWidth={1.2} />
        <g transform={`rotate(${angle})`}>
          {Array.from({ length: 10 }, (_, i) => (
            <circle key={i} cx={0} cy={-42} r={7} fill={i < accs.length ? '#c9a040' : '#6a2a1a'} stroke="#2a1008" transform={`rotate(${i * STEP})`} />
          ))}
        </g>
        <path d="M-6,-58 L6,-58 L0,-50 Z" fill="#ffe066" />
        <text y={4} fontSize={12} textAnchor="middle" fill="#f2e6c8">
          {accs.length}/{BEADS.beads}
        </text>
      </svg>
      <div className="muted small center">Жми, когда бусина под стрелкой. Точнее — больше сил и опыта.</div>
      {res && <div className={`verdict ${res.quality > 0.7 ? 'win' : ''}`}>{Math.round(res.quality * 100)}% · +{res.energy} ⚡ +{res.xp} ⭐</div>}
      {on ? (
        <button className="btn btn-wide btn-red" onClick={tap}>
          Щёлк
        </button>
      ) : (
        <button className="btn btn-wide" disabled={busy || p.games.beads <= 0 || wait} onClick={start}>
          {p.games.beads <= 0 ? 'Завтра' : wait ? `Отдохни ${timeLeft(p.games.beadsReadyAt - clock)}` : 'Взять чётки'}
        </button>
      )}
    </Table>
  );
}

// --- Рыбалка из окна -------------------------------------------------------------------------------

type Catch = { kind: 'item'; id: string } | { kind: 'mat'; id: string } | { kind: 'butts'; n: number } | { kind: 'none' };

function catchLabel(c: Catch): string {
  if (c.kind === 'item') return `${consumableById.get(c.id)?.emoji} ${consumableById.get(c.id)?.name}`;
  if (c.kind === 'mat') return `${matById.get(c.id as MatId)?.emoji} ${matById.get(c.id as MatId)?.name}`;
  if (c.kind === 'butts') return `🚬 ${c.n}`;
  return 'пусто';
}

export function FishGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [x, setX] = useState(0);
  const [on, setOn] = useState(false);
  const [casts, setCasts] = useState<number[]>([]);
  const [res, setRes] = useState<Catch[] | null>(null);
  const t0 = useRef(0);
  const target = useRef(0.6);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = (t: number) => {
      const s = (t - t0.current) / 1000;
      setX(Math.sin(s * (1.8 + casts.length * 0.4)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, casts.length]);
  const start = () => {
    setCasts([]);
    setRes(null);
    target.current = Math.random() * 1.2 - 0.6;
    t0.current = performance.now();
    startRun('fish');
    setOn(true);
  };
  const cast = async () => {
    const acc = Math.max(0, 1 - Math.abs(x - target.current) / 0.5);
    const next = [...casts, acc];
    setCasts(next);
    target.current = Math.random() * 1.2 - 0.6;
    if (next.length < FISH.casts) return;
    setOn(false);
    const r = await act<{ catches: Catch[] }>('fish', { accs: next });
    if (r) setRes(r.catches);
  };
  const hookX = 150 + x * 110;
  const winX = 150 + target.current * 110;
  return (
    <Table who="sheet/cast/youngster" title="🎣 Рыбалка из окна" left={`забросов сегодня: ${p.games.fish}`} onClose={onClose}>
      <svg viewBox="0 0 300 170" className="fish">
        <rect width={300} height={170} fill="#5a5a56" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={20 + i * 56} y={100} width={40} height={36} fill="#2a2e34" stroke="#1a1a1a" />
            {[0, 1, 2, 3].map((k) => (
              <rect key={k} x={26 + i * 56 + k * 9} y={100} width={2.4} height={36} fill="#777" />
            ))}
          </g>
        ))}
        {on && <rect x={winX - 22} y={96} width={44} height={44} fill="none" stroke="#ffe066" strokeWidth={2} strokeDasharray="4 3" />}
        <rect x={130} y={0} width={40} height={30} fill="#2a2e34" />
        <path d={`M150,30 Q${(150 + hookX) / 2},70 ${hookX},96`} stroke="#d8cfb8" strokeWidth={1.4} fill="none" />
        <text x={hookX} y={104} fontSize={12} textAnchor="middle">
          🧦
        </text>
      </svg>
      <div className="muted small center">«Конь» из носка качается — забрасывай, когда он над подсвеченным окном.</div>
      {on && <div className="verdict">Заброс {casts.length + 1} из {FISH.casts}</div>}
      {res && (
        <div className="fish-catch">
          {res.map((c, i) => (
            <span key={i} className={c.kind === 'none' ? 'no' : ''}>
              {catchLabel(c)}
            </span>
          ))}
        </div>
      )}
      {on ? (
        <button className="btn btn-wide btn-red" onClick={cast}>
          Забросить
        </button>
      ) : (
        <button className="btn btn-wide" disabled={busy || p.games.fish <= 0} onClick={start}>
          {p.games.fish <= 0 ? 'Завтра' : 'К окну'}
        </button>
      )}
    </Table>
  );
}

// --- Выжить в ШИЗО --------------------------------------------------------------------------------

type ShizoState = NonNullable<ReturnType<typeof useGame>['p']['tables']['shizo']>;
type ShizoEnd = { won: boolean; authority: number; xp: number; rep: number; term: number };

export function ShizoGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const s = p.tables.shizo;
  const [text, setText] = useState<{ t: string; bad: boolean } | null>(null);
  const [end, setEnd] = useState<ShizoEnd | null>(null);
  const [last, setLast] = useState<ShizoState | null>(null);
  const card = s ? shizoCardById.get(s.card) : null;
  const view = s ?? last;
  const start = async () => {
    setEnd(null);
    setText(null);
    await act('shizoStart');
  };
  const pick = async (i: number) => {
    const r = await act<{ text: string; failed: boolean; state: ShizoState; end: ShizoEnd | null }>('shizoPick', { choice: i });
    if (!r) return;
    setText({ t: r.text, bad: r.failed });
    setLast(r.state);
    if (r.end) setEnd(r.end);
  };
  const bar = (k: 'heat' | 'food' | 'spirit', icon: string, name: string) =>
    view && (
      <div className={`shizo-bar ${view[k] <= 2 ? 'low' : ''}`}>
        <span>
          {icon} {name}
        </span>
        <div>
          {Array.from({ length: SHIZO.max }, (_, i) => (
            <i key={i} className={i < view[k] ? 'on' : ''} />
          ))}
        </div>
      </div>
    );
  return (
    <Table who="sheet/cast/omon" title="🧱 Выжить в ШИЗО" left={`пять суток · раз в день · ${p.games.shizo ? 'можно' : 'завтра'}`} onClose={onClose}>
      <div className="shizo-scene">
        <LocationScene place="shizo">
          <Place x={180} y={268} scale={0.9}>
            <PoseG name="stand" anim="cold" look={lookOf(p)} />
          </Place>
        </LocationScene>
        {view && <div className="scene-tag">сутки {Math.min(view.day, SHIZO.days)} из {SHIZO.days}</div>}
      </div>
      {bar('heat', '🔥', 'Тепло')}
      {bar('food', '🍞', 'Сытость')}
      {bar('spirit', '✊', 'Дух')}
      {text && <div className={`shizo-text ${text.bad ? 'bad' : ''}`}>{text.t}</div>}
      {end ? (
        <>
          <div className={`verdict ${end.won ? 'win' : 'lose'}`}>
            {end.won ? `Не сломался! +${end.authority} 🎖️ · +${end.xp} ⭐ · 🃏 +${end.rep} · −${end.term} дн. срока` : 'Сломался. Увезли в санчасть'}
          </div>
          <button className="btn btn-wide btn-dark" onClick={onClose}>
            Выйти
          </button>
        </>
      ) : s && card ? (
        <>
          <div className="shizo-card">{card.text}</div>
          <div className="ev-opts">
            {card.opts.map((o, i) => (
              <button key={i} className="ev-opt" disabled={busy || (!!o.butts && p.butts < o.butts)} onClick={() => pick(i)}>
                <span className="ev-lbl">{o.label}</span>
                {o.risk && <small>риск</small>}
              </button>
            ))}
          </div>
          <div className="muted small center">Каждую ночь −1 ко всему. Ноль по любой шкале — сломался.</div>
        </>
      ) : (
        <>
          <div className="muted small center">Пять суток в бетонном мешке: тепло, еда и дух. Выдержишь — братва встретит как своего.</div>
          <button className="btn btn-wide btn-red" disabled={busy || p.games.shizo <= 0 || p.level < SHIZO.minLevel} onClick={start}>
            {p.level < SHIZO.minLevel ? `🔒 с ${SHIZO.minLevel} уровня` : p.games.shizo <= 0 ? 'Завтра' : 'Зайти в ШИЗО'}
          </button>
        </>
      )}
    </Table>
  );
}
