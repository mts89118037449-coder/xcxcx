import { GOLD_PRICES } from '../shared/content.ts';
import { fmt, timeLeft, useGame } from './game.tsx';
import { NotifyToggle, TermCard } from './Term.tsx';
import { SoundSettings } from './SoundSettings.tsx';
import { ReportButton } from './Report.tsx';

/** Профиль: срок, характеристики, лечение, статус, настройки и жалоба. */
export function ProfilePanel({ onMast }: { onMast(): void }) {
  const { p, now, act, busy, go } = useGame();
  return (
        <>
          <div className="rank-line">🎖️ {p.rank} · ур. {p.level}</div>
          <TermCard onMast={onMast} />
          <div className="stat-row">
            <div><span>⚔️</span>{p.stats.atk}<small>атака</small></div>
            <div><span>🛡️</span>{p.stats.def}<small>защита</small></div>
            <div><span>💥</span>{p.stats.crit}%<small>крит</small></div>
            <div><span>🎖️</span>{fmt(p.authority)}<small>авторитет</small></div>
            <div><span>🏆</span>#{p.place}<small>место</small></div>
            <div><span>🥊</span>{p.wins}/{p.losses}<small>драки</small></div>
          </div>
          <div className="row gap">
            <button className="btn btn-wide btn-dark" disabled={busy || p.hp >= p.stats.maxHp} onClick={() => act('heal')}>
              💉 Подлечиться · {GOLD_PRICES.heal} 🪙
            </button>
            <button className="btn btn-wide btn-dark" disabled={busy || p.energy >= p.stats.maxEnergy} onClick={() => act('refill')}>
              ☕ Энергия · {GOLD_PRICES.energyRefill} 🪙
            </button>
          </div>
          {!p.vipUntil && (
            <button className="vip-strip" onClick={() => go('shop')}>
              👑 Блатной статус: ⚡×2 · ₽+20% · 🪙10/день <b>Хочу</b>
            </button>
          )}
          {p.vipUntil && <div className="vip-strip on">👑 Блатной ещё {timeLeft(p.vipUntil - now)}</div>}
          <NotifyToggle />
          <SoundSettings />
          <ReportButton />
        </>
  );
}
