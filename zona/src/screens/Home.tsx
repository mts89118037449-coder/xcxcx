import { GOLD_PRICES, TATTOOS } from '../../shared/content.ts';
import { Card, fmt, timeLeft, useGame } from '../game.tsx';

export function Home() {
  const { p, now, online, act, toast, busy, go } = useGame();
  const dailyReady = now >= p.dailyReadyAt;
  const ink = TATTOOS.filter((t) => p.tattoos.includes(t.id));

  const daily = async () => {
    const r = await act<{ money: number; gold: number; streak: number }>('daily');
    if (r) toast(`Грев с воли: +${fmt(r.money)} ₽, +${r.gold} 🪙 (день ${r.streak})`);
  };

  return (
    <>
      <Card className="online">
        <span className="pulse" /> На зоне сейчас: <b>{fmt(online)}</b>
      </Card>

      <Card className={dailyReady ? 'glow' : ''}>
        <div className="row">
          <div>
            <b>📦 Ежедневный грев</b>
            <div className="muted">Серия: {p.dailyStreak}/7 · на 7-й день 10 🪙</div>
          </div>
          <button className="btn" disabled={!dailyReady || busy} onClick={daily}>
            {dailyReady ? 'Забрать' : timeLeft(p.dailyReadyAt - now)}
          </button>
        </div>
      </Card>

      <Card>
        <h3>Характеристики</h3>
        <div className="grid3">
          <div className="stat"><span>⚔️</span><b>{p.stats.atk}</b><small>атака</small></div>
          <div className="stat"><span>🛡️</span><b>{p.stats.def}</b><small>защита</small></div>
          <div className="stat"><span>💥</span><b>{p.stats.crit}%</b><small>крит</small></div>
          <div className="stat"><span>🎖️</span><b>{fmt(p.authority)}</b><small>авторитет</small></div>
          <div className="stat"><span>🏆</span><b>#{p.place}</b><small>в рейтинге</small></div>
          <div className="stat"><span>🥊</span><b>{p.wins}/{p.losses}</b><small>победы/пор.</small></div>
        </div>
        {ink.length > 0 && <div className="ink">{ink.map((t) => <span key={t.id} title={t.name}>{t.emoji}</span>)}</div>}
      </Card>

      <Card>
        <div className="row">
          <div>
            <b>{p.vipUntil ? '👑 Блатной статус' : '👑 Блатной статус не активен'}</b>
            <div className="muted">
              {p.vipUntil ? `ещё ${timeLeft(p.vipUntil - now)}` : 'x2 энергия, +20% денег, 10 🪙 в день'}
            </div>
          </div>
          <button className="btn btn-gold" onClick={() => go('shop')}>{p.vipUntil ? 'Продлить' : 'Хочу'}</button>
        </div>
      </Card>

      <div className="row gap">
        <button className="btn btn-wide" disabled={busy || p.hp >= p.stats.maxHp} onClick={() => act('heal')}>
          💉 Санчасть · {GOLD_PRICES.heal} 🪙
        </button>
        <button className="btn btn-wide" disabled={busy || p.energy >= p.stats.maxEnergy} onClick={() => act('refill')}>
          ⚡ Чифир · {GOLD_PRICES.energyRefill} 🪙
        </button>
      </div>

      <Card>
        <h3>Малявы</h3>
        <ul className="journal">
          {p.journal.map((j, i) => (
            <li key={i}>
              <small>{new Date(j.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
              {j.text}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
