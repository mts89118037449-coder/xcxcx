import { useCallback, useEffect, useState } from 'react';
import { RING } from '../shared/clans.ts';
import type { FightReplay, Look } from '../shared/types.ts';
import { api } from './api.ts';
import { RigHead } from './art/rig/Rig.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

interface RingFighter {
  id: number;
  name: string;
  level: number;
  look: Look;
  fee: number;
}
interface RingMatch {
  id: number;
  a: RingFighter;
  b: RingFighter;
  startsAt: number;
  fee: number;
  bets: { pid: number; name: string; side: 'a' | 'b'; amount: number }[];
}
interface RingDone extends RingMatch {
  winner: 'a' | 'b';
  replay: FightReplay;
  pool: number;
}
export interface RingView {
  queue: RingFighter[];
  cur: RingMatch | null;
  last: RingDone[];
}

/** Ринг: живые бои по очереди, зрители ставят на бойцов, бой можно посмотреть. */
export function RingPanel() {
  const { p, now, act, busy, toast, showFight } = useGame();
  const [ring, setRing] = useState<RingView | null>(null);
  const [amount, setAmount] = useState(RING.minBet);
  const load = useCallback(() => {
    api.ring().then((r) => setRing(r.ring)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);
  const maxBet = RING.minBet + p.level * RING.betPerLevel;
  const ration = 30 + p.level * 15;
  const m = ring?.cur;
  const inQueue = !!ring && (ring.queue.some((f) => f.id === p.id) || (!!m && (m.a.id === p.id || m.b.id === p.id)));
  const myBet = m?.bets.find((b) => b.pid === p.id);
  const sum = (side: 'a' | 'b') => m?.bets.filter((b) => b.side === side).reduce((s, b) => s + b.amount, 0) ?? 0;

  const join = async () => {
    if ((await act('ringJoin')) !== null) toast('🥊 Записан на ринг');
    load();
  };
  const bet = async (side: 'a' | 'b') => {
    if ((await act('ringBet', { side, amount })) !== null) toast(`Ставка ${fmt(amount)} ₽ на ${side === 'a' ? m!.a.name : m!.b.name}`);
    load();
  };
  const watch = (d: RingDone) =>
    showFight({
      title: `🥊 Ринг: ${d.a.name} против ${d.b.name}`,
      replay: d.replay,
      me: { name: d.a.name, look: d.a.look },
      enemy: { name: d.b.name, look: d.b.look },
      verdict: `🏆 ${d.winner === 'a' ? d.a.name : d.b.name}`,
      lines: [`Банк ставок: ${fmt(d.pool)} ₽`],
    });

  const corner = (f: RingFighter, side: 'a' | 'b') => (
    <div className={`ring-corner ${side}`}>
      <RigHead look={f.look} size={72} />
      <b>{f.name}</b>
      <small>ур. {f.level}</small>
      <i>ставки: {fmt(sum(side))} ₽</i>
      {m && !myBet && now < m.startsAt && f.id !== p.id && m.a.id !== p.id && m.b.id !== p.id && (
        <button className="btn btn-s" disabled={busy || p.money < amount} onClick={() => bet(side)}>
          На него
        </button>
      )}
      {myBet?.side === side && <em>твоя ставка {fmt(myBet.amount)} ₽</em>}
    </div>
  );

  return (
    <div className="ring">
      {!ring && <div className="muted center">Загрузка…</div>}
      {m ? (
        <>
          <div className="ring-vs">
            {corner(m.a, 'a')}
            <div className="ring-mid">
              <span>VS</span>
              <small>{now < m.startsAt ? `бой через ${timeLeft(m.startsAt - now)}` : 'идёт бой…'}</small>
              <small className="muted">куш бойцу {fmt(m.fee)} ₽</small>
            </div>
            {corner(m.b, 'b')}
          </div>
          {!myBet && now < m.startsAt && m.a.id !== p.id && m.b.id !== p.id && (
            <div className="ring-bet">
              <span>Ставка</span>
              {[RING.minBet, Math.round(maxBet / 4 / 10) * 10, Math.round(maxBet / 2 / 10) * 10, maxBet]
                .filter((x, i, arr) => x >= RING.minBet && arr.indexOf(x) === i)
                .map((x) => (
                  <button key={x} className={`chip ${amount === x ? 'active' : ''}`} onClick={() => setAmount(x)}>
                    {fmt(x)}
                  </button>
                ))}
            </div>
          )}
          <small className="muted center block">Угадал — делишь банк проигравших пропорционально ставке, {Math.round(RING.cut * 100)}% — на общак.</small>
        </>
      ) : (
        ring && <div className="ring-empty">🥊 Ринг пуст. {ring.queue.length ? `${ring.queue[0].name} ждёт соперника` : 'Выходи первым'}</div>
      )}
      <button className="btn btn-wide btn-red" disabled={busy || inQueue || p.level < RING.minLevel} onClick={join}>
        {p.level < RING.minLevel ? `🔒 с ${RING.minLevel} уровня` : inQueue ? '✓ Ты в очереди' : `Выйти на ринг · ${fmt(RING.feeRations * ration)} ₽`}
      </button>
      {ring && ring.queue.length > 0 && (
        <div className="muted small">
          Очередь: {ring.queue.map((f) => `${f.name} (${f.level})`).join(', ')}
        </div>
      )}
      {ring && ring.last.length > 0 && (
        <>
          <h3 className="section">Прошлые бои</h3>
          <div className="ring-last">
            {ring.last.map((d) => (
              <button key={d.id} className="ring-done" onClick={() => watch(d)}>
                <span className={d.winner === 'a' ? 'w' : ''}>{d.a.name}</span>
                <small>vs</small>
                <span className={d.winner === 'b' ? 'w' : ''}>{d.b.name}</span>
                <i>▶</i>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
