import { itemLines } from '../Perks.tsx';
import { useEvent } from '../Events.tsx';
import { useCallback, useEffect, useState } from 'react';
import { BALANCE, BOSSES, GOLD_PRICES, WORLD_BOSS, itemById } from '../../shared/content.ts';
import type { FightReplay, Look, WorldBossView } from '../../shared/types.ts';
import { api } from '../api.ts';
import { BOSS_LOOKS, CharacterG } from '../art/Character.tsx';
import { artUrl, useArt } from '../art/raster.ts';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { NpcBanner } from '../art/sprites.tsx';
import { Bar, Card, fmt, lookOf, timeLeft, useAnim, useGame } from '../game.tsx';

type FightResult = FightReplay;

export function Fight() {
  const { p, now, act, busy, showFight, toast } = useGame();
  const talk = useTalk();
  const [world, setWorld] = useState<WorldBossView | null>(null);
  const [anim, animKey, play] = useAnim();
  const art = useArt();

  const loadWorld = useCallback(() => {
    api.world().then((r) => setWorld(r.world)).catch(() => {});
  }, []);

  useEffect(() => {
    loadWorld();
    const id = setInterval(loadWorld, 5000); // общий босс меняется от ударов других игроков
    return () => clearInterval(id);
  }, [loadWorld]);

  const lowHp = p.hp < p.stats.maxHp * BALANCE.pvpMinHpShare;

  const pvp = usePvp();
  const openEvent = useEvent();

  const boss = async (bossId: string, name: string) => {
    const r = await act<FightResult & { reward: { money: number; xp: number; authority: number; gold: number; drop: string | null; item: string | null }; used: string[] }>('boss', { bossId });
    if (!r) return;
    const drop = r.reward.drop ? itemById.get(r.reward.drop) : null;
    showFight({
      title: name,
      replay: r,
      enemy: { name, npc: bossId, ...BOSS_LOOKS[bossId] },
      lines: r.win
        ? [
            `+${fmt(r.reward.money)} ₽ · +${r.reward.xp} опыта · +${r.reward.authority} авторитета`,
            ...(r.reward.gold ? [`+${r.reward.gold} 🪙`] : []),
            ...(drop ? [`🎁 Трофей: ${drop.emoji} ${drop.name}!`] : []),
            ...itemLines(r.used, r.reward.item),
          ]
        : [`+${r.reward.xp} опыта за смелость`, ...itemLines(r.used, null)],
    });
  };

  const hitWorld = async () => {
    const r = await act<{ damage: number; crit: boolean; killed: boolean }>('worldHit');
    if (!r) return;
    play('lunge-r');
    toast(r.killed ? '🔥 Ты добил! Награда разослана всем участникам' : `Удар на ${fmt(r.damage)}${r.crit ? ' 💥' : ''}`);
    loadWorld();
  };

  // прогулка — бесплатный случай во дворе раз в полчаса
  const walkYard = async () => {
    const r = await act<{ id: string }>('yard');
    if (r) openEvent(r.id);
  };

  const worldReady = now >= p.worldHitReadyAt;
  const pvpReady = now >= p.pvpReadyAt;

  return (
    <>
      <div className="scene-wrap">
        <Stage onTalk={talk} loc="yard" look={lookOf(p)} mood={lowHp ? 'hurt' : 'idle'} anim={anim} animKey={animKey} />
        <div className="scene-tag">🥊 Двор</div>
        <button className="scene-btn" disabled={busy || now < p.yardReadyAt} onClick={walkYard}>
          {now < p.yardReadyAt ? `🚶 ${timeLeft(p.yardReadyAt - now)}` : '🚶 Прогуляться'}
        </button>
      </div>
      {world && (
        <NpcBanner who="spetsnaz" name="Командир ОМОНа" text="На централе бунт. Мы заходим через час — успейте отличиться" />
      )}
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
            <button className="btn btn-red" disabled={busy || !worldReady || lowHp} onClick={hitWorld}>
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
          <button className="btn btn-red" disabled={busy || !pvpReady || lowHp} onClick={pvp}>
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
              {artUrl(art, `npc/${b.id}_face`) ? (
                <img className="boss-face" src={artUrl(art, `npc/${b.id}_face`)!} alt={b.name} />
              ) : (
                <svg className="boss-face" viewBox="42 0 36 44">
                  <CharacterG look={BOSS_LOOKS[b.id].look} build={BOSS_LOOKS[b.id].build} />
                </svg>
              )}
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
                <button className="btn btn-red" disabled={busy || lowHp} onClick={() => boss(b.id, b.name)}>
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

/** Наезд на сокамерника — вызывается и с кнопки, и из диалога во дворе. */
export function usePvp() {
  const { act, showFight } = useGame();
  return async () => {
      const r = await act<FightResult & { enemy: string; enemyLook: Look; loot: number; authority: number; xp: number; item: string | null; used: string[] }>('pvp');
      if (!r) return;
      showFight({
        title: `Наезд: ${r.enemy}`,
        replay: r,
        enemy: { name: r.enemy, look: r.enemyLook },
        lines: r.win
          ? [`Отжал ${fmt(r.loot)} ₽`, `+${r.authority} авторитета`, `+${r.xp} опыта`, ...itemLines(r.used, r.item)]
          : [`${r.authority} авторитета`, 'Отлежись и возвращайся', ...itemLines(r.used, null)],
      });
  };
}
