import { useEffect, useState } from 'react';
import { LEAGUE, LEAGUE_TIERS, leagueTier, nextTier } from '../shared/league.ts';
import { cosmeticById } from '../shared/season.ts';
import { api } from './api.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

type Row = { id: number; name: string; level: number; pts: number; title: string | null };

/** Лига наездов: где ты, сколько до следующей, таблица недели и награда за прошлую. */
export function LeagueCard() {
  const { p, act, busy, now, toast } = useGame();
  const [data, setData] = useState<{ top: Row[]; prev: Row[]; myRank: number | null; endsAt: number } | null>(null);
  const [open, setOpen] = useState(false);
  const L = p.league;
  const tier = leagueTier(L.pts);
  const next = nextTier(L.pts);
  useEffect(() => {
    api.league().then(setData).catch(() => null);
  }, [L.pts]);
  const claim = async () => {
    const r = await act<{ gold: number; money: number; title: boolean }>('leagueClaim');
    if (r) toast(`+${r.gold} 🪙${r.money ? ` +${fmt(r.money)} ₽` : ''}${r.title ? ' · титул «Чемпион двора»' : ''}`);
  };
  const lastTier = L.last ? leagueTier(L.last.pts) : null;
  return (
    <div className={`league league-${tier.id}`}>
      <div className="league-head" onClick={() => setOpen(!open)}>
        <span className="league-badge">{tier.emoji}</span>
        <span className="grow">
          <b>Лига: {tier.name}</b>
          <small>
            {L.pts} очк. · побед {L.wins}
            {data?.myRank ? ` · место #${data.myRank}` : ''}
          </small>
        </span>
        <small className="muted">{data ? `⏳ ${timeLeft(data.endsAt - now)}` : ''}</small>
      </div>
      <div className="league-ladder">
        {LEAGUE_TIERS.map((t) => (
          <div key={t.id} className={`league-step ${L.pts >= t.min ? 'on' : ''} ${t.id === tier.id ? 'cur' : ''}`}>
            <span>{t.emoji}</span>
            <small>{t.min}</small>
          </div>
        ))}
        <div className="league-fill" style={{ width: `${Math.min(100, (LEAGUE_TIERS.findIndex((t) => t.id === tier.id) + (next ? (L.pts - tier.min) / (next.min - tier.min) : 1)) * (100 / (LEAGUE_TIERS.length - 1)))}%` }} />
      </div>
      <div className="muted small">
        {next ? `До «${next.name}» — ${next.min - L.pts} очк. ` : 'Выше некуда. '}
        Соперник — по силе (твоя 💪{fmt(L.power)}). Сильнее — больше очков, за слабых очков нет.
      </div>
      {L.claimable && lastTier && (
        <button className="btn btn-wide btn-gold" disabled={busy} onClick={claim}>
          🎁 Итоги прошлой недели: {lastTier.emoji} {lastTier.name}
        </button>
      )}
      {open && data && (
        <div className="league-table">
          {data.top.length ? (
            data.top.map((r, i) => (
              <div key={r.id} className={`league-row ${r.id === p.id ? 'me' : ''}`}>
                <i>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</i>
                <span className="grow">
                  {r.name}
                  {r.title && <small className="muted"> · {cosmeticById.get(r.title)?.value ?? ''}</small>}
                </span>
                <small className="muted">ур. {r.level}</small>
                <b>{r.pts}</b>
              </div>
            ))
          ) : (
            <div className="muted small center">На этой неделе ещё никто не наезжал</div>
          )}
          {data.prev.length > 0 && (
            <div className="muted small">
              Прошлая неделя: {data.prev.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.name}`).join(' · ')}
            </div>
          )}
          <div className="muted small">
            Награды недели: {LEAGUE_TIERS.filter((t) => t.gold).map((t) => `${t.emoji} ${t.gold}🪙`).join(' · ')} · места 1–3: +{LEAGUE.topGold.join('/')}🪙, первому — титул «Чемпион двора».
          </div>
        </div>
      )}
      <button className="league-more" onClick={() => setOpen(!open)}>
        {open ? 'Скрыть таблицу ▴' : 'Таблица недели ▾'}
      </button>
    </div>
  );
}
