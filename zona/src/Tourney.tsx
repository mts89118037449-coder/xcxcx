import { ModalHead } from './Nav.tsx';
import { useEffect, useState } from 'react';
import { NARDY, TOURNEY, nardyLand, nardyStep, type NardyPick } from '../shared/minigames2.ts';
import { api } from './api.ts';
import { Die, NardyBoard } from './Minigames2.tsx';
import { timeLeft, useGame } from './game.tsx';

export interface DuelView {
  id: string;
  ids: [number, number];
  names: [string, string];
  pos: [number, number];
  turn: 0 | 1;
  dice: [number, number];
  status: 'play' | 'over';
  winner: 0 | 1 | null;
  forfeit: boolean;
  turnAt: number;
  log: string[];
}
type Row = { id: number; name: string; pts: number; w: number; l: number };
type Data = { duels: DuelView[]; table: Row[]; myPlace: number | null; prevTop: Row[]; claimable: boolean; endsAt: number; now: number };

/** Карточка турнира на вкладке «Игры»: сколько партий, где твой ход. */
export function TourneyCard() {
  const { p } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api.duels<Data>().then(setData).catch(() => null);
  useEffect(() => {
    if (p.level >= TOURNEY.minLevel) load();
  }, [p.level]);
  if (p.level < TOURNEY.minLevel || !data) return null;
  const myTurn = data.duels.filter((d) => d.status === 'play' && d.ids[d.turn] === p.id).length;
  return (
    <>
      <button className={`tourney-card ${myTurn ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="tourney-ico">🎲</span>
        <span className="grow">
          <b>Турнир в нарды</b>
          <small>
            {myTurn ? `твой ход в ${myTurn} парт.` : 'с живыми игроками, ход раз в несколько часов'}
            {data.myPlace ? ` · место #${data.myPlace}` : ''}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <TourneyModal data={data} reload={load} onClose={() => setOpen(false)} />}
    </>
  );
}

function TourneyModal({ data, reload, onClose }: { data: Data; reload(): void; onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [sel, setSel] = useState<string | null>(data.duels.find((d) => d.status === 'play' && d.ids[d.turn] === p.id)?.id ?? null);
  const d = data.duels.find((x) => x.id === sel);
  const challenge = async () => {
    const r = await act<{ rival: string; id: string }>('duelChallenge', { id: 0 });
    if (r) {
      toast(`Соперник: ${r.rival}`);
      reload();
      setSel(r.id);
    }
  };
  const move = async (pick: NardyPick) => {
    if (!d) return;
    const r = await act<{ over: boolean; winner: 0 | 1 | null }>('duelMove', { id: d.id, pick });
    if (r?.over) toast(d.ids[r.winner ?? 0] === p.id ? `🏆 Победа! +${TOURNEY.win} очк.` : 'Проигрыш');
    reload();
  };
  const forfeit = async (resign: boolean) => {
    if (!d) return;
    await act('duelForfeit', { id: d.id, resign });
    reload();
  };
  const claim = async () => {
    const r = await act<{ gold: number; rank: number }>('tourneyClaim');
    if (r) toast(`${r.rank} место: +${r.gold} 🪙`);
    reload();
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body tourney" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <h2>🎲 Турнир в нарды</h2>
        {data.claimable && (
          <button className="btn btn-wide btn-gold" disabled={busy} onClick={claim}>
            🎁 Приз за прошлую неделю
          </button>
        )}
        <div className="tourney-list">
          {data.duels.map((x) => {
            const me = x.ids.indexOf(p.id) as 0 | 1;
            const rival = x.names[me === 0 ? 1 : 0];
            const mine = x.status === 'play' && x.turn === me;
            return (
              <button key={x.id} className={`tourney-duel ${sel === x.id ? 'active' : ''} ${mine ? 'mine' : ''}`} onClick={() => setSel(x.id)}>
                <b>{rival}</b>
                <small>{x.status === 'over' ? (x.winner === me ? '🏆 победа' : '✖ проигрыш') : mine ? '👉 твой ход' : '⏳ ход соперника'}</small>
              </button>
            );
          })}
          <button className="tourney-duel new" disabled={busy} onClick={challenge}>
            <b>＋ Партия</b>
            <small>случайный соперник</small>
          </button>
        </div>
        {d && <DuelBoard d={d} me={d.ids.indexOf(p.id) as 0 | 1} now={data.now} busy={busy} move={move} forfeit={forfeit} />}
        <div className="tourney-table">
          <b>Таблица недели · до конца {timeLeft(data.endsAt - data.now)}</b>
          {data.table.length ? (
            data.table.map((r, i) => (
              <div key={r.id} className={`league-row ${r.id === p.id ? 'me' : ''}`}>
                <i>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</i>
                <span className="grow">{r.name}</span>
                <small className="muted">
                  {r.w}–{r.l}
                </small>
                <b>{r.pts}</b>
              </div>
            ))
          ) : (
            <div className="muted small">Ещё никто не доиграл партию на этой неделе</div>
          )}
          <div className="muted small">
            Победа +{TOURNEY.win}, соперник пропал больше {TOURNEY.turnH} ч — победа +{TOURNEY.forfeitWin}. Призы недели: {TOURNEY.topGold.join('/')} 🪙. До {TOURNEY.perDay} новых партий в день.
          </div>
          {data.prevTop.length > 0 && <div className="muted small">Прошлая неделя: {data.prevTop.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.name}`).join(' · ')}</div>}
        </div>
      </div>
    </div>
  );
}

function DuelBoard({ d, me, now, busy, move, forfeit }: { d: DuelView; me: 0 | 1; now: number; busy: boolean; move(p: NardyPick): void; forfeit(resign: boolean): void }) {
  const him = me === 0 ? 1 : 0;
  const mine = d.status === 'play' && d.turn === me;
  const late = d.status === 'play' && !mine && now - d.turnAt > TOURNEY.turnH * 3600_000;
  return (
    <div className="duel-board">
      <NardyBoard me={d.pos[me]} him={d.pos[him]} />
      <div className="muted small center">
        ⚪ ты · ⚫ {d.names[him]} · до {NARDY.finish}
      </div>
      {mine ? (
        <>
          <div className="nardy-roll">
            <span>
              тебе: <Die v={d.dice[0]} />
              <Die v={d.dice[1]} />
            </span>
          </div>
          <div className="nardy-picks">
            {(['a', 'b', 'sum'] as NardyPick[]).map((k) => {
              const to = nardyLand(d.pos[me], nardyStep(d.dice, k));
              return (
                <button key={k} className="btn btn-s" disabled={busy} onClick={() => move(k)}>
                  {k === 'sum' ? `${d.dice[0]}+${d.dice[1]}` : d.dice[k === 'a' ? 0 : 1]} → {to === NARDY.finish ? '🏠' : to}
                </button>
              );
            })}
          </div>
        </>
      ) : d.status === 'play' ? (
        <div className="muted small center">Ход {d.names[him]} — бот напишет, когда походит. Ждём уже {timeLeft(now - d.turnAt)}.</div>
      ) : null}
      <ul className="duo-log">
        {d.log.slice(0, 4).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {d.status === 'play' && (
        <div className="row gap">
          {late && (
            <button className="btn btn-s btn-gold" disabled={busy} onClick={() => forfeit(false)}>
              ⌛ Забрать победу
            </button>
          )}
          <button className="btn btn-s btn-dark" disabled={busy} onClick={() => confirm('Сдаться?') && forfeit(true)}>
            🏳️ Сдаться
          </button>
        </div>
      )}
    </div>
  );
}
