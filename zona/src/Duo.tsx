import { useEffect, useState } from 'react';
import { DUO, ESCAPE, ESCAPE_STAGES } from '../shared/events.ts';
import { api } from './api.ts';
import { StageGame } from './Escape.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

type Mate = { id: number; name: string; level: number };

/** Побег вдвоём: позвать кента, принять приглашение, сходить свою часть этапа. */
export function DuoPanel() {
  const { p, now, act, busy, toast } = useGame();
  const [mates, setMates] = useState<Mate[] | null>(null);
  const d = p.duo;

  useEffect(() => {
    if (d || p.duoInvite || p.level < DUO.minLevel) return;
    // кого позвать: свой клан и те, кого ты подтянул
    Promise.all([p.clan ? api.clan(p.clan.id).then((r) => r.clan.members) : Promise.resolve([]), api.refs().then((r) => r.refs)])
      .then(([clan, refs]) => {
        const all = new Map<number, Mate>();
        for (const m of [...clan, ...refs]) if (m.id !== p.id && m.level >= DUO.minLevel) all.set(m.id, { id: m.id, name: m.name, level: m.level });
        setMates([...all.values()].slice(0, 12));
      })
      .catch(() => setMates([]));
  }, [d, p.duoInvite, p.clan?.id]);

  const step = async (quality: number) => {
    const r = await act<{ resolved: boolean; caught?: boolean; passed?: boolean }>('duoStep', { quality });
    if (r?.resolved && r.caught) toast('🚨 Взяли обоих — но о вас говорит вся зона', 'err');
  };

  if (p.duoInvite)
    return (
      <div className="card duo">
        <b>🤝 {p.duoInvite.name} зовёт в побег вдвоём</b>
        <p className="muted small">
          Ходите по очереди, каждый в своё время. Сорвёшься — кент попробует вытащить. Награда каждому ×{DUO.rewardMul}. Стоит ⚡{ESCAPE.energy}. Ответь до{' '}
          {timeLeft(p.duoInvite.at + DUO.inviteH * 3600_000 - now)}.
        </p>
        <div className="row gap">
          <button className="btn btn-wide btn-red" disabled={busy} onClick={() => act('duoAccept')}>
            Бежим!
          </button>
          <button className="btn btn-wide btn-dark" disabled={busy} onClick={() => act('duoDecline')}>
            Не сейчас
          </button>
        </div>
      </div>
    );

  if (d?.status === 'invite')
    return (
      <div className="card duo">
        <b>🤝 Ждём {d.partner}</b>
        <p className="muted small">Приглашение висит ещё {timeLeft(d.inviteUntil - now)}. Откажется или не ответит — энергия вернётся.</p>
      </div>
    );

  if (d?.status === 'run') {
    const st = ESCAPE_STAGES[Math.min(d.stage, ESCAPE_STAGES.length - 1)];
    return (
      <div className="card duo">
        <b>
          🤝 Побег с {d.partner} · этап {d.stage + 1}/{ESCAPE_STAGES.length}
        </b>
        <div className="duo-status">
          <span className={d.myMove ? 'ok' : 'wait'}>Ты: {d.myMove ? '✔ сходил' : 'твой ход'}</span>
          <span className={d.theirMove ? 'ok' : 'wait'}>
            {d.partner}: {d.theirMove ? '✔ сходил' : 'ждём'}
          </span>
        </div>
        {!d.myMove && <StageGame key={d.stage} kind={st.game} name={st.name} text={st.text} onDone={step} />}
        {d.myMove && <p className="muted small center">Кенту пришло сообщение от бота. Как сходит — этап решится.</p>}
        <ul className="duo-log">
          {d.log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <button className="btn btn-s btn-dark" disabled={busy} onClick={() => confirm('Дать отбой? Оба вернётесь тихо с долей награды.') && act('duoBail')}>
          🤫 Дать отбой
        </button>
      </div>
    );
  }

  if (p.level < DUO.minLevel) return null;
  return (
    <div className="card duo">
      <b>🤝 Побег вдвоём</b>
      <p className="muted small">
        Позови кента из клана или того, кого подтянул. Каждый ходит свою часть этапа; прошедший тянет сорвавшегося — но если не вытащит, берут обоих. Награда каждому ×
        {DUO.rewardMul}, вместе чуть легче.
      </p>
      {mates === null ? (
        <div className="muted small">Ищем своих…</div>
      ) : mates.length ? (
        <div className="duo-mates">
          {mates.map((m) => (
            <button key={m.id} className="btn btn-s btn-dark" disabled={busy || p.energy < ESCAPE.energy} onClick={() => act('duoInvite', { id: m.id }).then((r) => r && toast(`Позвал ${m.name}`))}>
              {m.name} · ур. {m.level}
            </button>
          ))}
        </div>
      ) : (
        <div className="muted small">Звать некого: вступи в клан или подтяни друга по ссылке (Бой → Братва).</div>
      )}
      <div className="muted small">Стоит ⚡{ESCAPE.energy}. Деньги за 4 этапа вдвоём: ~{fmt(Math.round(40 * 4 ** 1.6 * DUO.rewardMul + p.level * 20 * 4 ** 1.6 * DUO.rewardMul))} ₽.</div>
    </div>
  );
}
