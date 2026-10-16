import { RENO, renoCost } from '../shared/reno.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

/** Ремонт хаты: этапы по очереди, бригада работает несколько часов. */
export function RenoCard({ onDone }: { onDone?(): void }) {
  const { p, now, act, busy } = useGame();
  const r = p.reno;
  const st = RENO[r.stage];
  const working = r.until > now;
  const ready = r.until > 0 && r.until <= now;
  const cost = st ? renoCost(st, p.level) : 0;
  const total = st ? st.hours * 3600_000 : 1;
  const pct = working ? Math.round(100 * (1 - (r.until - now) / total)) : ready ? 100 : 0;
  return (
    <div className="reno-card">
      <div className="reno-head">
        <b>🛠️ Ремонт хаты</b>
        <span className="muted small">
          {Math.min(r.stage, RENO.length)}/{RENO.length}
        </span>
      </div>
      <div className="reno-steps">
        {RENO.map((s, i) => (
          <span key={s.id} className={i < r.stage ? 'on' : i === r.stage ? 'cur' : ''} title={s.name}>
            {s.emoji}
          </span>
        ))}
      </div>
      {!st ? (
        <p className="muted small">Хата как с картинки. Все этапы готовы.</p>
      ) : (
        <>
          <div className="reno-now">
            <span className="reno-ico">{st.emoji}</span>
            <span className="grow">
              <b>{st.name}</b>
              <small>
                +{st.comfort} уюта · {Object.entries(st.bonus).map(([k, v]) => `+${v} ${BONUS_LABEL[k] ?? k}`).join(' · ')}
              </small>
            </span>
          </div>
          {working || ready ? (
            <>
              <div className="bar reno-bar">
                <div style={{ width: `${pct}%` }} />
              </div>
              {ready ? (
                <button className="btn btn-wide btn-gold" disabled={busy} onClick={async () => (await act('renoFinish')) && onDone?.()}>
                  ✅ Принять работу
                </button>
              ) : (
                <div className="reno-row">
                  <span className="muted small">👷 Бригада работает · {timeLeft(r.until - now)}</span>
                  <button className="btn btn-s btn-gold" disabled={busy || p.gold < r.rush} onClick={() => act('renoRush')}>
                    ⚡ {r.rush} 🪙
                  </button>
                </div>
              )}
            </>
          ) : (
            <button className="btn btn-wide" disabled={busy || p.level < st.minLevel || p.money < cost} onClick={() => act('renoStart')}>
              {p.level < st.minLevel ? `🔒 с ${st.minLevel} уровня` : `Нанять бригаду · ${fmt(cost)} ₽ · ${st.hours} ч`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const BONUS_LABEL: Record<string, string> = { hp: '❤️', energy: '⚡', def: '🛡️', crit: '💥', atk: '👊', money: '% ₽' };
