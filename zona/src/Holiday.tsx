import { useEffect, useState } from 'react';
import { EGG, holidayById } from '../shared/holidays.ts';
import { api } from './api.ts';
import { timeLeft, useGame } from './game.tsx';

/** Баннер праздника: виден, только пока он идёт. */
export function HolidayCard() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  const h = p.holiday;
  if (!h) return null;
  const def = holidayById.get(h.id)!;
  const ready = h.dailyReady || def.tasks.some((t, i) => !h.claimed[i] && (h.prog[i] ?? 0) >= t.n);
  return (
    <>
      <button className={`hol-card hol-${h.id} ${ready ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="hol-ico">{def.emoji}</span>
        <span className="grow">
          <b>{def.name} на зоне</b>
          <small>
            {def.token.emoji} {h.tokens} · ещё {timeLeft(h.endsAt - now)}
          </small>
        </span>
        <i>{ready ? '🎁' : '▸'}</i>
      </button>
      {open && <HolidayModal onClose={() => setOpen(false)} />}
    </>
  );
}

function HolidayModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const [arm, setArm] = useState<{ id: number; name: string; power: number }[] | null>(null);
  const h = p.holiday;
  useEffect(() => {
    if (h?.id === 'feb23') api.holiday().then((r) => setArm(r.arm)).catch(() => null);
  }, [h?.id]);
  if (!h) return null;
  const def = holidayById.get(h.id)!;
  const tok = def.token.emoji;
  const eggIn = h.eggAt + EGG.cooldownMin * 60_000 - now;
  return (
    <div className="modal" onClick={onClose}>
      <div className={`modal-body hol-modal hol-${h.id}`} onClick={(e) => e.stopPropagation()}>
        <div className="hol-head">
          <span className="hol-big">{def.emoji}</span>
          <div>
            <b>{def.name}</b>
            <small>ещё {timeLeft(h.endsAt - now)}</small>
          </div>
          <span className="hol-tokens">
            {tok} {h.tokens}
          </span>
        </div>
        <button
          className="btn btn-wide"
          disabled={busy || !h.dailyReady}
          onClick={async () => {
            const r = await act<{ tokens: number }>('holDaily');
            if (r) toast(`${def.emoji} Праздничный грев: +${r.tokens} ${tok}`);
          }}
        >
          {h.dailyReady ? `🎁 Праздничный грев · +${def.daily + (h.tree ? 2 : 0)} ${tok}` : '🎁 Грев завтра'}
        </button>

        <div className="hol-fun">
          <b>{def.fun.name}</b>
          <small>{def.fun.text}</small>
          {def.fun.id === 'tree' && (
            <button className="btn btn-dark" disabled={busy || h.tree} onClick={() => act('holTree').then((r) => r !== null && toast('🎄 Ёлка горит в хате!'))}>
              {h.tree ? '🎄 Ёлка наряжена · +2 🍊 к грев' : '🎄 Нарядить ёлку'}
            </button>
          )}
          {def.fun.id === 'egg' && (
            <button
              className="btn btn-dark"
              disabled={busy || eggIn > 0 || h.tokens < 1}
              onClick={async () => {
                const r = await act<{ won: boolean }>('holEgg');
                if (r) toast(r.won ? '🥚💥 Твоя целая — забрал крашенку!' : '🥚 Треснула твоя… минус крашенка', r.won ? undefined : 'err');
              }}
            >
              {eggIn > 0 ? `🥚 ${timeLeft(eggIn)}` : '🥚 Стукнуться (ставка 1 🥚)'}
            </button>
          )}
          {def.fun.id === 'arm' && (
            <div className="hol-arm">
              <small>Твоя лучшая сила: 💪 {h.armBest || '—'} (жми армрестлинг в «Играх»)</small>
              {arm?.slice(0, 5).map((r, i) => (
                <div key={r.id} className={r.id === p.id ? 'me' : ''}>
                  <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span> {r.name} <b>💪 {r.power}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hol-tasks">
          {def.tasks.map((t, i) => {
            const done = (h.prog[i] ?? 0) >= t.n;
            return (
              <div key={i} className={`hol-task ${h.claimed[i] ? 'claimed' : done ? 'done' : ''}`}>
                <span className="grow">
                  {t.text}
                  <span className="pet-bar">
                    <i style={{ width: `${Math.min(100, ((h.prog[i] ?? 0) / t.n) * 100)}%` }} />
                  </span>
                </span>
                <button className="btn btn-s" disabled={busy || !done || h.claimed[i]} onClick={() => act('holClaim', { index: i })}>
                  {h.claimed[i] ? '✓' : `+${t.tokens} ${tok}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="hol-shop">
          {def.shop.map((it) => {
            const had = h.bought[it.id] ?? 0;
            const max = it.max ?? 1;
            const owned = !!it.give.cosmetic && p.cosmetics.includes(it.give.cosmetic);
            return (
              <button
                key={it.id}
                className="pet-offer"
                disabled={busy || owned || had >= max || h.tokens < it.cost}
                onClick={async () => {
                  const r = await act<{ heal: number }>('holBuy', { id: it.id });
                  if (r) toast(`${it.emoji} ${it.name}${r.heal ? ` · ❤️+${r.heal}` : ''}`);
                }}
              >
                <span className="pet-ico">{it.emoji}</span>
                <small>{it.name}</small>
                <i>{owned ? 'есть' : `${it.cost} ${tok}`}</i>
              </button>
            );
          })}
        </div>
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
