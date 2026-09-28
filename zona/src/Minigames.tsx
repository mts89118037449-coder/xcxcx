import { useEffect, useRef, useState } from 'react';
import { BREW, CARDS, RACE, ROACHES } from '../shared/minigames.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

export type Mini = 'cards' | 'race' | 'brew';

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
