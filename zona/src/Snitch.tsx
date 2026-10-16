import { useEffect, useState } from 'react';
import { SNITCH } from '../shared/snitch.ts';
import { api } from './api.ts';
import { Face } from './art/sprites.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

type View = Awaited<ReturnType<typeof api.snitch>>;

/** «Кто стукач?» в своём клане: доска подозреваемых, улики, голос. Стукач видит свою тайную роль. */
export function SnitchBoard() {
  const { p, now, act, busy, toast } = useGame();
  const [v, setV] = useState<View | null>(null);
  const load = () => api.snitch().then(setV).catch(() => null);
  useEffect(() => {
    load();
  }, [p.clan?.id]);
  if (!p.clan || !v) return null;
  if (!v.active)
    return (
      <div className="sn-wrap">
        <b>🐀 Кто стукач?</b>
        <small className="muted">Игра начинается в кланах от {v.need} человек: каждую неделю один из своих — тайный стукач.</small>
      </div>
    );
  const vote = async (id: number) => {
    const r = await act<{ result: { who: number; caught: boolean } | null }>('snitchVote', { id });
    if (!r) return;
    if (r.result) toast(r.result.caught ? '🎯 Стукач раскрыт! Общак вернули' : '😬 Обвинили невиновного…', r.result.caught ? undefined : 'err');
    else toast('🗳️ Голос учтён');
    load();
  };
  const leak = async () => {
    const r = await act<{ amount: number }>('snitchLeak');
    if (r) {
      toast(`🐀 Кум доволен: +${fmt(r.amount)} ₽`);
      load();
    }
  };
  return (
    <div className="sn-wrap">
      <div className="sn-head">
        <b>🐀 Кто стукач?</b>
        <small>неделя кончится через {timeLeft(v.endsAt - now)}</small>
      </div>
      {v.me === 'snitch' && !v.resolved && (
        <div className="sn-secret">
          <span>🤫</span>
          <div>
            <b>Ты — стукач этой недели</b>
            <small>Никто не знает. Сливай куму общак раз в день — но каждая сдача оставляет улику.</small>
            <button className="btn btn-red" disabled={busy} onClick={leak}>
              🐀 Слить куму ({Math.round(SNITCH.leakShare * 100)}% общака)
            </button>
          </div>
        </div>
      )}
      {v.resolved && (
        <div className={`sn-result ${v.resolved.caught ? 'caught' : 'miss'}`}>
          {v.resolved.caught ? `🎯 Раскрыли: ${v.resolved.name} — стукач. Общак вернули.` : `😬 Обвинили ${v.resolved.name}, а стукачом был ${v.resolved.snitchName}.`}
        </div>
      )}
      <div className="sn-board">
        {v.members.map((m) => (
          <button key={m.id} className={`sn-card ${v.myVote === m.id ? 'mine' : ''} ${v.resolved?.who === m.id ? (v.resolved.caught ? 'caught' : 'miss') : ''}`} disabled={busy || !!v.resolved || v.myVote !== null || m.id === p.id || v.me === 'late'} onClick={() => vote(m.id)}>
            <Face face={m.face} size={44} />
            <small>{m.name}</small>
            <i>ур. {m.level}</i>
            {m.votes > 0 && <span className="sn-pins">{'📌'.repeat(Math.min(m.votes, 5))}</span>}
          </button>
        ))}
      </div>
      <small className="muted center">
        {v.myVote !== null ? 'Ты уже указал. ' : 'Тапни, кого подозреваешь. '}Больше половины голосов на одном — приговор.
      </small>
      <div className="sn-clues">
        <b>🔎 Улики · сливов {v.leaks.length}</b>
        {v.leaks.length === 0 && <small className="muted">Пока тихо. Может, стукач затаился.</small>}
        {v.leaks.map((l, i) => (
          <div key={i} className="sn-clue">
            <span>−{fmt(l.amount)} ₽ из общака</span>
            <b>{l.clue}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
