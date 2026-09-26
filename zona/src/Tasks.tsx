import { DAILY_BONUS_GOLD, DAILY_KINDS, GOLD_PRICES, QUEST_TEMPLATES } from '../shared/content.ts';
import { Bar, Card, fmt, timeLeft, useGame } from './game.tsx';

const label = new Map(DAILY_KINDS.map((k) => [k.kind, k.label]));
const tplById = new Map(QUEST_TEMPLATES.map((t) => [t.id, t]));

/** Полночь по Москве — когда обновятся дейлики. */
function nextMoscowMidnight(now: number) {
  const msk = now + 3 * 3600_000;
  return msk - (msk % 86_400_000) + 86_400_000 - 3 * 3600_000;
}

export function Dailies() {
  const { p, now, act, busy, toast } = useGame();
  const { tasks, bonusClaimed } = p.daily;
  const done = tasks.filter((t) => t.claimed).length;
  return (
    <Card>
      <div className="row">
        <h3 style={{ margin: 0 }}>📋 Дела на день</h3>
        <span className="muted small">новые через {timeLeft(nextMoscowMidnight(now) - now)}</span>
      </div>
      {tasks.map((t, i) => {
        const ready = t.progress >= t.target && !t.claimed;
        return (
          <div key={i} className="row line">
            <div className="grow">
              <b>{label.get(t.kind)}: {t.target}</b>
              <Bar kind="xp" value={t.progress} max={t.target} label={`${t.progress}/${t.target}`} />
              <div className="muted small">+{fmt(t.money)} ₽ · +{t.xp} опыта · +{t.gold} 🪙</div>
            </div>
            <button
              className="btn btn-s"
              disabled={busy || !ready}
              onClick={async () => {
                const r = await act<{ bonus: number }>('task', { index: i });
                if (r) toast(r.bonus ? `Все дела закрыты! +${r.bonus} 🪙 сверху` : 'Награда получена');
              }}
            >
              {t.claimed ? '✓' : 'Забрать'}
            </button>
          </div>
        );
      })}
      <div className="muted small center" style={{ marginTop: 6 }}>
        {bonusClaimed ? '✓ Бонус за все дела получен' : `Закрой все ${tasks.length} (${done}/${tasks.length}) — ещё +${DAILY_BONUS_GOLD} 🪙`}
      </div>
    </Card>
  );
}

export function Quests() {
  const { p, now, act, busy, toast } = useGame();
  const a = p.quests.active;
  const left = a ? a.endsAt - now : 0;
  const skip = a ? Math.max(1, Math.ceil(left / 600_000)) * GOLD_PRICES.questSkipPer10Min : 0;

  const finish = async () => {
    const r = await act<{ ok: boolean; money: number; gold: number; xp: number; tpl: string }>('questFinish');
    if (!r) return;
    const name = tplById.get(r.tpl)?.name ?? 'Поручение';
    toast(r.ok ? `${name}: +${fmt(r.money)} ₽, +${r.xp} опыта${r.gold ? `, +${r.gold} 🪙` : ''}` : `${name}: спалился. Только +${r.xp} опыта`, r.ok ? 'ok' : 'err');
  };

  return (
    <>
      <div className="row" style={{ margin: '16px 2px 8px' }}>
        <h3 className="section" style={{ margin: 0 }}>Поручения</h3>
        <button className="btn btn-link" style={{ padding: 0 }} disabled={busy} onClick={() => act('questReroll')}>
          🎲 Другие · {GOLD_PRICES.questReroll} 🪙
        </button>
      </div>
      {a && (
        <Card className="glow">
          <b>⏳ {tplById.get(a.tpl)?.name}</b>
          <div className="muted small">{tplById.get(a.tpl)?.text}</div>
          <Bar kind="en" value={a.minutes * 60_000 - Math.max(0, left)} max={a.minutes * 60_000} label={left > 0 ? timeLeft(left) : 'Готово'} />
          <div className="row end gap-s">
            {left > 0 ? (
              <button className="btn btn-s btn-gold" disabled={busy} onClick={() => act('questSkip')}>
                Ускорить · {skip} 🪙
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={finish}>
                Узнать результат
              </button>
            )}
          </div>
        </Card>
      )}
      {p.quests.board.map((q) => {
        const tpl = tplById.get(q.tpl);
        return (
          <Card key={q.key}>
            <div className="row">
              <div className="grow">
                <b>{tpl?.name}</b>
                <div className="muted small">{tpl?.text}</div>
                <div className="muted small">
                  ⏱ {q.minutes} мин · {fmt(q.money)} ₽ · {q.xp} опыта{q.gold ? ` · ${q.gold} 🪙` : ''} · шанс {Math.round(q.chance * 100)}%
                </div>
              </div>
              <button
                className="btn"
                disabled={busy || !!a}
                onClick={async () => {
                  if ((await act('questStart', { key: q.key })) !== null) toast('Пошёл выполнять');
                }}
              >
                ⚡{q.energy}
              </button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
