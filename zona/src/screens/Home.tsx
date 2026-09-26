import { useState } from 'react';
import { FURNITURE, GOLD_PRICES, SPOT_NAMES, TATTOOS, type Furniture } from '../../shared/content.ts';
import { Stage } from '../art/Stage.tsx';
import { useHero } from '../art/hero.tsx';
import { BonusList, Card, Price, fmt, lookOf, timeLeft, useAnim, useGame } from '../game.tsx';

export function Home() {
  const { p, now, online, act, toast, busy, go } = useGame();
  const [bare, setBare] = useState(false);
  const hero = useHero();
  const [anim, animKey, play] = useAnim();
  const dailyReady = now >= p.dailyReadyAt;
  const ink = TATTOOS.filter((t) => p.tattoos.includes(t.id));
  const hurt = p.hp < p.stats.maxHp * 0.3;

  const daily = async () => {
    const r = await act<{ money: number; gold: number; streak: number }>('daily');
    if (!r) return;
    play('act-cheer');
    toast(`Грев с воли: +${fmt(r.money)} ₽, +${r.gold} 🪙 (день ${r.streak})`);
  };

  const furnish = async (f: Furniture) => {
    if (f.currency === 'gold' && !confirm(`Поставить «${f.name}» за ${f.price} 🪙?`)) return;
    if ((await act('furnish', { furnitureId: f.id })) === null) return;
    play('act-cheer');
    toast(`${f.emoji} ${f.name} — теперь в хате`);
  };

  return (
    <>
      <div className="scene-wrap">
        <Stage
          loc="cell"
          look={lookOf(p)}
          bare={bare}
          mood={hurt ? 'hurt' : 'idle'}
          furniture={p.furniture}
          anim={anim}
          animKey={animKey}
          onClick={() => play('act-cheer')}
        />
        <div className="scene-tag">🏚️ Хата · {p.furniture.length}/{FURNITURE.length}</div>
        {ink.length > 0 && !hero && (
          <button className="scene-btn" onClick={() => setBare(!bare)}>
            {bare ? '👕 Одеться' : '💪 Показать наколки'}
          </button>
        )}
      </div>

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

      <h3 className="section">Обустроить хату</h3>
      <div className="hscroll">
        {FURNITURE.map((f) => {
          const owned = p.furniture.includes(f.id);
          const locked = p.level < f.minLevel;
          return (
            <div key={f.id} className={`ftile ${owned ? 'owned' : ''} ${f.currency === 'gold' && !owned ? 'premium' : ''}`}>
              <span className="femoji">{f.emoji}</span>
              <b>{f.name}</b>
              <span className="muted small">{SPOT_NAMES[f.spot]}</span>
              <BonusList b={f} />
              <button
                className={`btn btn-s ${f.currency === 'gold' ? 'btn-gold' : ''}`}
                disabled={owned || locked || busy}
                onClick={() => furnish(f)}
              >
                {owned ? '✓ Стоит' : locked ? `🔒 ур. ${f.minLevel}` : <Price amount={f.price} currency={f.currency} />}
              </button>
            </div>
          );
        })}
      </div>

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
