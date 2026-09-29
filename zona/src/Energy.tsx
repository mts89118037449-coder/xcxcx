import { GameTiles } from './Leisure.tsx';
import { BALANCE, GOLD_PRICES } from '../shared/content.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

/** Всё про энергию: таймеры восстановления и способы пополнить. */
export function EnergySheet({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast, go, openPlace } = useGame();
  const max = p.stats.maxEnergy;
  const full = p.energy >= max;
  const perPoint = (BALANCE.energyRegenSec * 1000) / (p.vipUntil ? 2 : 1);
  const toNext = p.nextEnergyAt ? Math.max(0, p.nextEnergyAt - now) : 0;
  const toFull = full ? 0 : toNext + (max - p.energy - 1) * perPoint;

  const run = async (type: string, msg: string) => {
    if ((await act(type)) !== null) toast(msg);
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h2>⚡ Энергия {p.energy}/{max}</h2>
        <div className="grid3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
          <div className="stat"><small>+1 через</small><b>{full ? '—' : timeLeft(toNext)}</b></div>
          <div className="stat"><small>полная через</small><b>{full ? 'уже' : timeLeft(toFull)}</b></div>
        </div>
        <div className="muted small center" style={{ marginBottom: 12 }}>
          +1 каждые {Math.round(perPoint / 60000)} мин{p.vipUntil ? ' (👑 вдвое быстрее)' : ' · с блатным статусом вдвое быстрее'}
        </div>
        <div className="energy-opts">
          <button className="btn btn-wide" disabled={busy || full || p.chifir <= 0} onClick={() => run('chifir', 'Чифирнул — энергия полная')}>
            🍵 Выпить чифир (есть {p.chifir})
          </button>
          <button className="btn btn-wide btn-dark" disabled={busy || full} onClick={() => run('energy', '+30 энергии')}>
            ⚡ +30 энергии · {GOLD_PRICES.energySmall} 🪙
          </button>
          <button className="btn btn-wide btn-dark" disabled={busy || full} onClick={() => run('refill', 'Энергия полная')}>
            ⚡ Полная · {GOLD_PRICES.energyRefill} 🪙
          </button>
          <button className="btn btn-wide btn-dark" disabled={busy} onClick={() => run('buyChifir', 'Кружка чифира про запас')}>
            🍵 Кружка про запас · {GOLD_PRICES.chifir} 🪙
          </button>
          <button
            className="btn btn-wide btn-gold"
            onClick={() => {
              onClose();
              go('shop');
            }}
          >
            ⭐ 10 кружек за звёзды
          </button>
        </div>
        <div className="muted small center" style={{ marginTop: 10 }}>У тебя {fmt(p.gold)} 🪙</div>
        <div className="section" style={{ marginTop: 14 }}>Пока ждёшь — бесплатно</div>
        <div onClick={onClose}>
          <GameTiles />
        </div>
      </div>
    </div>
  );
}
