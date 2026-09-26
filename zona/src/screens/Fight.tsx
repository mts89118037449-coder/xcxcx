import { useCallback, useEffect, useState } from 'react';
import { BALANCE, BOSSES, GOLD_PRICES, WORLD_BOSS, itemById } from '../../shared/content.ts';
import type { WorldBossView } from '../../shared/types.ts';
import { api } from '../api.ts';
import { Bar, Card, fmt, timeLeft, useGame } from '../game.tsx';

interface FightResult {
  win: boolean;
  log: string[];
}

export function Fight() {
  const { p, now, act, busy, showFight, toast } = useGame();
  const [world, setWorld] = useState<WorldBossView | null>(null);

  const loadWorld = useCallback(() => {
    api.world().then((r) => setWorld(r.world)).catch(() => {});
  }, []);

  useEffect(() => {
    loadWorld();
    const id = setInterval(loadWorld, 5000); // общий босс меняется от ударов других игроков
    return () => clearInterval(id);
  }, [loadWorld]);

  const lowHp = p.hp < p.stats.maxHp * BALANCE.pvpMinHpShare;

  const pvp = async () => {
    const r = await act<FightResult & { enemy: string; loot: number; authority: number; xp: number }>('pvp');
    if (!r) return;
    showFight({
      title: `Наезд на ${r.enemy}`,
      win: r.win,
      log: r.log,
      lines: r.win
        ? [`Отжал ${fmt(r.loot)} ₽`, `+${r.authority} авторитета`, `+${r.xp} опыта`]
        : [`${r.authority} авторитета`, 'Отлежись и возвращайся'],
    });
  };

  const boss = async (bossId: string, name: string) => {
    const r = await act<FightResult & { reward: { money: number; xp: number; authority: number; gold: number; drop: string | null } }>('boss', { bossId });
    if (!r) return;
    const drop = r.reward.drop ? itemById.get(r.reward.drop) : null;
    showFight({
      title: name,
      win: r.win,
      log: r.log,
      lines: r.win
        ? [
            `+${fmt(r.reward.money)} ₽ · +${r.reward.xp} опыта · +${r.reward.authority} авторитета`,
            ...(r.reward.gold ? [`+${r.reward.gold} 🪙`] : []),
            ...(drop ? [`🎁 Трофей: ${drop.emoji} ${drop.name}!`] : []),
          ]
        : [`+${r.reward.xp} опыта за смелость`],
    });
  };

  const hitWorld = async () => {
    const r = await act<{ damage: number; crit: boolean; killed: boolean }>('worldHit');
    if (!r) return;
    toast(r.killed ? '🔥 Ты добил! Награда разослана всем участникам' : `Удар на ${fmt(r.damage)}${r.crit ? ' 💥' : ''}`);
    loadWorld();
  };

  const worldReady = now >= p.worldHitReadyAt;
  const pvpReady = now >= p.pvpReadyAt;

  return (
    <>
      {world && (
        <Card className="world">
          <div className="row">
            <b>{WORLD_BOSS.emoji} {WORLD_BOSS.name} #{world.gen}</b>
            <span className="muted">{world.participants} бойцов</span>
          </div>
          <Bar kind="boss" value={world.hp} max={world.maxHp} />
          <div className="muted small">
            Бьют все игроки сервера. Награда {fmt(WORLD_BOSS.rewardPool.money)} ₽ делится по урону, топ-3 получают{' '}
            {WORLD_BOSS.topGold.join('/')} 🪙
          </div>
          <div className="row">
            <span>Твой урон: <b>{fmt(world.myDamage)}</b></span>
            <button className="btn btn-red" disabled={busy || !worldReady || lowHp || p.energy < WORLD_BOSS.energy} onClick={hitWorld}>
              {worldReady ? `Ударить ⚡${WORLD_BOSS.energy}` : timeLeft(p.worldHitReadyAt - now)}
            </button>
          </div>
          {world.top.length > 0 && (
            <ol className="dmg-top">
              {world.top.slice(0, 5).map((h) => (
                <li key={h.id} className={h.id === p.id ? 'me' : ''}>
                  <span>{h.name}</span>
                  <b>{fmt(h.damage)}</b>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <Card>
        <div className="row">
          <div>
            <b>🥊 Наехать на сокамерника</b>
            <div className="muted">Соперник твоего уровня. Победа — отжимаешь 10% его денег</div>
          </div>
          <button className="btn btn-red" disabled={busy || !pvpReady || lowHp || p.energy < BALANCE.pvpEnergy} onClick={pvp}>
            {pvpReady ? `⚡${BALANCE.pvpEnergy}` : timeLeft(p.pvpReadyAt - now)}
          </button>
        </div>
        {p.shieldUntil > now && <div className="muted small">🛡️ Тебя не тронут ещё {timeLeft(p.shieldUntil - now)}</div>}
        {lowHp && <div className="warn">Здоровья меньше 30% — сначала в санчасть или подожди</div>}
      </Card>

      <h3 className="section">Боссы</h3>
      {BOSSES.map((b) => {
        const locked = p.level < b.minLevel;
        const cd = (p.bossCd[b.id] ?? 0) - now;
        return (
          <Card key={b.id} className={locked ? 'locked' : ''}>
            <div className="row">
              <div className="boss-emoji">{b.emoji}</div>
              <div className="grow">
                <b>{b.name}</b>
                <div className="muted small">{b.description}</div>
                <div className="muted small">
                  ❤️{fmt(b.hp)} ⚔️{b.atk} 🛡️{b.def} · награда {fmt(b.reward.money[0])}+ ₽
                  {b.drops.length > 0 && ` · 🎁 ${b.drops.map((d) => itemById.get(d.itemId)?.emoji).join('')}`}
                </div>
              </div>
            </div>
            <div className="row end gap-s">
              {locked ? (
                <span className="muted">🔒 с {b.minLevel} уровня</span>
              ) : cd > 0 ? (
                <>
                  <span className="muted">⏳ {timeLeft(cd)}</span>
                  <button className="btn btn-s btn-gold" disabled={busy} onClick={() => act('bossReset', { bossId: b.id })}>
                    Сейчас · {GOLD_PRICES.bossReset} 🪙
                  </button>
                </>
              ) : (
                <button className="btn btn-red" disabled={busy || lowHp || p.energy < b.energy} onClick={() => boss(b.id, b.name)}>
                  В бой ⚡{b.energy}
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </>
  );
}
