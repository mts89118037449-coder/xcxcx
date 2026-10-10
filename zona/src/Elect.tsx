import { ModalHead } from './Nav.tsx';
import { useEffect, useState } from 'react';
import { DECREES, ELECT } from '../shared/elect.ts';
import { api } from './api.ts';
import { Face } from './art/sprites.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';
import { NowChip } from './Chip.tsx';

type View = Awaited<ReturnType<typeof api.elect>>;

/** Смотрящий за зоной: баннер с указом и налогом; тап — выборы. */
export function SmotrCard({ chip }: { chip?: boolean } = {}) {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const s = p.smotr;
  const decree = s?.decree ? DECREES.find((d) => d.id === s.decree)?.text : null;
  if (chip)
    return (
      <>
        <NowChip icon={s ? <Face face={s.face} size={30} /> : '👑'} label={s ? 'Смотрящий' : 'Выборы'} sub={s ? s.name : 'смотрящего нет'} hot={s?.id === p.id} onClick={() => setOpen(true)} />
        {open && <ElectModal onClose={() => setOpen(false)} />}
      </>
    );
  return (
    <>
      <button className={`smotr-card ${s?.id === p.id ? 'me' : ''}`} onClick={() => setOpen(true)}>
        {s ? <Face face={s.face} size={40} /> : <span className="smotr-crown">👑</span>}
        <span className="grow">
          <b>{s ? `Смотрящий: ${s.name}` : 'Смотрящего нет'}</b>
          <small>{s ? (decree ?? 'указов пока нет') : 'выборы идут всю неделю — выдвигайся или голосуй'}</small>
        </span>
        {s && s.tax > 0 && <i className="smotr-tax">налог {s.tax}%</i>}
      </button>
      {open && <ElectModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ElectModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const [v, setV] = useState<View | null>(null);
  const [top, setTop] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    api.elect().then(setV).catch(() => null);
  }, []);
  const run = async (type: string, body: Record<string, unknown> = {}, ok?: string) => {
    const r = await act<View>(type, body);
    if (r) {
      if ('candidates' in r) setV(r);
      if (ok) toast(ok);
    }
  };
  const mine = v?.smotr?.id === p.id;
  useEffect(() => {
    if (mine) api.top().then((r) => setTop(r.top.filter((x) => x.id !== p.id).slice(0, 12))).catch(() => null);
  }, [mine]);
  if (!v) return null;
  const s = v.smotr;
  const max = Math.max(1, ...v.candidates.map((c) => c.votes));
  const inList = v.candidates.some((c) => c.id === p.id);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <div className="smotr-throne">
          <span className="smotr-crown big">👑</span>
          {s ? (
            <>
              <Face face={s.face} size={64} />
              <b>{s.name}</b>
              <small>смотрящий этой недели · в стройку собрано {fmt(s.collected)} ₽</small>
            </>
          ) : (
            <small>На этой неделе зона без смотрящего</small>
          )}
        </div>
        {mine && s && (
          <div className="smotr-panel">
            <b>Твоя власть</b>
            <small className="muted">Налог со смен в стройку (десятая доля — тебе):</small>
            <div className="smotr-taxes">
              {Array.from({ length: ELECT.maxTax + 1 }, (_, i) => (
                <button key={i} className={`btn btn-s ${s.tax === i ? '' : 'btn-dark'}`} disabled={busy} onClick={() => run('smotrTax', { tax: i })}>
                  {i}%
                </button>
              ))}
            </div>
            <button className="btn btn-s" disabled={busy || s.salary <= 0} onClick={() => act<{ money: number }>('smotrSalary').then((r) => r && (toast(`+${fmt(r.money)} ₽ — твоя доля`), api.elect().then(setV)))}>
              💰 Твоя доля: {fmt(s.salary)} ₽
            </button>
            <small className="muted">Указ дня {s.decreeToday ? '— уже оглашён' : ''}:</small>
            <div className="smotr-decrees">
              {DECREES.map((d) => (
                <button key={d.id} className={s.decree === d.id ? 'on' : ''} disabled={busy || s.decreeToday} onClick={() => run('smotrDecree', { id: d.id }, '📜 Указ оглашён')}>
                  {d.text}
                </button>
              ))}
            </div>
            <small className="muted">Помиловать одного за неделю (−{ELECT.pardonDays} дн. срока){s.pardoned ? ' — уже' : ''}:</small>
            <div className="ref-list">
              {top.map((x) => (
                <button key={x.id} disabled={busy || s.pardoned} onClick={() => confirm(`Похлопотать за ${x.name}?`) && run('smotrPardon', { id: x.id }, `🕊️ ${x.name} помилован`)}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="elect-head">
          <b>🗳️ Выборы на следующую неделю</b>
          <small>
            итоги через {timeLeft(v.endsAt - now)} · твой голос весит {v.myWeight}
          </small>
        </div>
        <div className="elect-list">
          {v.candidates.length === 0 && <div className="muted center">Пока никто не выдвинулся</div>}
          {v.candidates.map((c, i) => (
            <div key={c.id} className={`elect-row ${v.myVote === c.id ? 'mine' : ''}`}>
              <span>{i === 0 ? '👑' : `${i + 1}.`}</span>
              <Face face={c.face} size={32} />
              <span className="grow">
                <b>{c.name}</b>
                <span className="elect-bar">
                  <i style={{ width: `${(c.votes / max) * 100}%` }} />
                </span>
                <small>
                  {c.votes} голосов · {c.voters} чел.
                </small>
              </span>
              <button className="btn btn-s" disabled={busy || v.myVote !== null || p.level < ELECT.voteLevel} onClick={() => run('electVote', { id: c.id }, `🗳️ Голос за ${c.name}`)}>
                {v.myVote === c.id ? '✓' : 'За'}
              </button>
            </div>
          ))}
        </div>
        {!inList && (
          <button className="btn btn-wide btn-dark" disabled={busy || p.level < ELECT.nominateLevel || p.authority < ELECT.nominateAuthority || p.money < ELECT.nominateFee} onClick={() => run('electNominate', {}, '📣 Ты в списке кандидатов')}>
            {p.level < ELECT.nominateLevel || p.authority < ELECT.nominateAuthority ? `🔒 Выдвигаться: ур. ${ELECT.nominateLevel}, 🎖️ ${ELECT.nominateAuthority}` : `📣 Выдвинуться · ${fmt(ELECT.nominateFee)} ₽`}
          </button>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
