import { DAILY_WEEK, MASTS, MAST_RULES, NOTICE_KINDS, TERM, mastById, type Mast } from '../shared/term.ts';
import { consumableById } from '../shared/perks.ts';
import { NpcPortrait } from './art/sprites.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

/** Выбор масти: четыре пути, у каждого свои бонусы. Первый раз — бесплатно. */
export function MastPicker({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const pick = async (id: Mast) => {
    const m = mastById.get(id)!;
    if (p.mast && !confirm(`Сменить масть на «${m.name}»? Это ${MAST_RULES.changeGold} 🪙 и −${Math.round(MAST_RULES.changeAuthorityLoss * 100)}% авторитета.`)) return;
    const r = await act<{ lost: number }>('mast', { id });
    if (!r) return;
    toast(`${m.emoji} Теперь ты ${m.name.toLowerCase()}`);
    onClose();
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body mast-body" onClick={(e) => e.stopPropagation()}>
        <h2 className="center">Выбери масть</h2>
        <div className="muted small center">На зоне у каждого своё место. От масти зависят бонусы, реплики и отношение к тебе.</div>
        <div className="mast-grid">
          {MASTS.map((m) => (
            <div key={m.id} className={`mast-card ${p.mast === m.id ? 'on' : ''}`}>
              <NpcPortrait who={m.who} className="mast-pic" />
              <b>
                {m.emoji} {m.name}
              </b>
              <small>{m.pitch}</small>
              <ul>
                {m.perks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <button className="btn btn-s" disabled={busy || p.mast === m.id} onClick={() => pick(m.id)}>
                {p.mast === m.id ? '✓ Твоя' : p.mast ? `Перейти · ${MAST_RULES.changeGold} 🪙` : 'Выбрать'}
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          {p.mast ? 'Закрыть' : 'Подумаю'}
        </button>
      </div>
    </div>
  );
}

/** Профиль: масть, срок до УДО, ходки. */
export function TermCard({ onMast }: { onMast(): void }) {
  const { p, act, busy, toast } = useGame();
  const m = p.mast ? mastById.get(p.mast) : null;
  const served = Math.max(0, p.termTotal - p.term);
  const release = async () => {
    if (!confirm(`Выйти по УДО? Уровень, навыки и деньги начнутся заново, шмот, наколки, хата и золото останутся. Навсегда: +${TERM.bonusPerHodka}% к деньгам и опыту за ходку, сейчас +${TERM.releaseGold * p.hodka} 🪙.`)) return;
    const r = await act<{ hodka: number; bonus: number }>('release');
    if (r) toast(`🔓 Свобода! Ходка №${r.hodka}, бонус +${r.bonus}%`);
  };
  return (
    <div className="term-card">
      <div className="term-row">
        <div>
          <b>⛓️ Ходка №{p.hodka}</b>
          <small>{p.hodkaBonus ? `бонус ходок +${p.hodkaBonus}% к деньгам и опыту` : 'первая ходка'}</small>
        </div>
        <button className="btn btn-s btn-dark" onClick={onMast} disabled={p.level < MAST_RULES.minLevel}>
          {m ? `${m.emoji} ${m.name}` : p.level < MAST_RULES.minLevel ? `🔒 масть с ${MAST_RULES.minLevel} ур.` : '🃏 Выбрать масть'}
        </button>
      </div>
      <div className="term-bar">
        <div style={{ width: `${(served / p.termTotal) * 100}%` }} />
        <span>{p.term > 0 ? `до УДО ${Math.ceil(p.term)} дн. из ${p.termTotal}` : 'срок вышел'}</span>
      </div>
      {p.term > 0 ? (
        <small className="muted">Срок скашивают смены, боссы, дела дня, сюжет и случаи. Пойманный в побеге — довесок.</small>
      ) : (
        <button className="btn btn-wide btn-gold" disabled={busy} onClick={release}>
          🔓 Выйти по УДО и зайти следующей ходкой
        </button>
      )}
    </div>
  );
}

/** Неделя грева: семь дней подряд, седьмой — большой. */
export function DailyWeek({ onClose }: { onClose(): void }) {
  const { p, now, act, busy } = useGame();
  const ready = now >= p.dailyReadyAt;
  // какой день будет следующим: серия сгорает, если пропустить больше суток
  const alive = now - (p.dailyReadyAt - 24 * 3600_000) < 2 * 24 * 3600_000;
  const next = ready ? (alive ? (p.dailyStreak % 7) + 1 : 1) : p.dailyStreak;
  const claim = async () => {
    if ((await act('daily')) !== null) onClose();
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h2 className="center">📦 Грев с воли</h2>
        <div className="muted small center">Заходи каждый день — на седьмой придёт большой грев. Пропустишь день — серия начнётся заново.</div>
        <div className="week">
          {DAILY_WEEK.map((w, i) => {
            const day = i + 1;
            const got = ready ? day < next : day <= next;
            const cur = ready && day === next;
            return (
              <div key={day} className={`week-day ${got ? 'got' : ''} ${cur ? 'cur' : ''} ${day === 7 ? 'big' : ''}`}>
                <small>день {day}</small>
                <span>{day === 7 ? '🎁' : w.item ? consumableById.get(w.item)?.emoji : w.butts ? '🚬' : w.chifir ? '☕' : '💰'}</span>
                <b>{w.label}</b>
                <i>
                  {[w.money && `${fmt(Math.round(w.money * (1 + p.level / 5)))}₽`, w.butts && `${w.butts}🚬`, w.gold && `${w.gold}🪙`].filter(Boolean).join(' ')}
                </i>
                {got && <em>✓</em>}
              </div>
            );
          })}
        </div>
        <button className="btn btn-wide" disabled={!ready || busy} onClick={claim}>
          {ready ? `Забрать день ${next}` : `Следующий через ${timeLeft(p.dailyReadyAt - now)}`}
        </button>
      </div>
    </div>
  );
}

export function NotifyToggle() {
  const { p, act, busy } = useGame();
  return (
    <>
      <label className="notify-toggle">
        <input type="checkbox" checked={p.notifyOn} disabled={busy} onChange={(e) => act('notify', { on: e.target.checked })} />
        <span>🔔 Напоминания от бота (не больше 3 в день, ночью молчим)</span>
      </label>
      {p.notifyOn && (
        <div className="notify-kinds">
          {NOTICE_KINDS.map((k) => {
            const on = !p.notifyOff.includes(k.id);
            return (
              <button key={k.id} className={on ? 'on' : ''} disabled={busy} onClick={() => act('notifyKind', { kind: k.id, on: !on })}>
                <span>{k.icon}</span>
                {k.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
