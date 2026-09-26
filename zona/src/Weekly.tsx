import { WEEKLY_EVENTS, WEEKLY_REWARDS } from '../shared/content.ts';
import { Bar, Card, fmt, timeLeft, useGame } from './game.tsx';

export function WeeklyCard() {
  const { p, now, act, toast } = useGame();
  const ev = WEEKLY_EVENTS.find((e) => e.id === p.weekly.event);
  if (!ev) return null;
  const max = ev.tiers[2];
  return (
    <Card className="world">
      <div className="row">
        <b>🗓️ {ev.name}</b>
        <span className="muted small">ещё {timeLeft(p.weekly.endsAt - now)}</span>
      </div>
      <div className="muted small">{ev.desc}</div>
      <Bar kind="boss" value={Math.min(p.weekly.progress, max)} max={max} label={`${ev.goal.label}: ${fmt(p.weekly.progress)} / ${fmt(max)}`} />
      <div className="week-tiers">
        {ev.tiers.map((t, i) => {
          const done = p.weekly.claimed.includes(i);
          const ready = !done && p.weekly.progress >= t;
          const r = WEEKLY_REWARDS[i];
          return (
            <button
              key={i}
              className={`week-tier ${ready ? 'ready' : ''} ${done ? 'done' : ''}`}
              disabled={!ready}
              onClick={async () => {
                if ((await act('weekly', { tier: i })) !== null) toast(`Награда недели: +${fmt(r.money)} ₽, +${r.gold} 🪙`);
              }}
            >
              <span>{done ? '✅' : ['📦', '🎁', '💰'][i]}</span>
              <b>{fmt(t)}</b>
              <small className="muted">
                {r.gold} 🪙{r.chifir ? ` · ${r.chifir} 🍵` : ''}
              </small>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
