import { itemLines } from '../Perks.tsx';
import { useEvent } from '../Events.tsx';
import { useCallback, useEffect, useState } from 'react';
import { BALANCE, BOSSES, GOLD_PRICES, WORLD_BOSS, itemById } from '../../shared/content.ts';
import type { FightReplay, Look, WorldBossView } from '../../shared/types.ts';
import { api } from '../api.ts';
import { NpcPortrait } from '../art/sprites.tsx';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { Bar, Card, fmt, lookOf, timeLeft, useAnim, useGame } from '../game.tsx';
import { SegBar, useSeg } from '../Seg.tsx';
import { RingPanel } from '../Ring.tsx';

type FightSeg = 'bosses' | 'riot' | 'pvp' | 'ring' | 'crew';

/** Разделы «Боя»: «Братва» — отдельный экран, но переключается отсюда же. */
export function FightNav({ value, onChange }: { value: FightSeg; onChange(v: FightSeg): void }) {
  const { go } = useGame();
  return (
    <SegBar
      value={value}
      onChange={(v) => (v === 'crew' ? go('top') : (go('fight'), onChange(v)))}
      items={[
        { id: 'bosses', icon: '👹', label: 'Боссы' },
        { id: 'pvp', icon: '🥊', label: 'Наезд' },
        { id: 'riot', icon: '🔥', label: 'Бунт' },
        { id: 'ring', icon: '🏟️', label: 'Ринг' },
        { id: 'crew', icon: '🏴', label: 'Братва' },
      ]}
    />
  );
}

type FightResult = FightReplay;

export function Fight() {
  const { p, now, act, busy, toast } = useGame();
  const [seg, setSeg] = useSeg('fight', 'bosses', ['bosses', 'riot', 'pvp', 'ring'] as const);
  const talk = useTalk();
  const [world, setWorld] = useState<WorldBossView | null>(null);
  const [anim, animKey, play] = useAnim();

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

  const boss = async (bossId: string, _name: string) => {
    await act('boss', { bossId }); // бой откроется сам — он пошаговый
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
      <FightNav value={seg} onChange={(v) => v !== 'crew' && setSeg(v)} />
      {seg === 'riot' && world && (
        <Card className="world">
          <div className="row">
            <b>{WORLD_BOSS.emoji} {WORLD_BOSS.name} #{world.gen}</b>
            <span className="muted">{world.participants} бойцов</span>
          </div>
          <Bar kind="boss" value={world.hp} max={world.maxHp} />
          <div className="row">
            <span className="muted small">💰 {fmt(WORLD_BOSS.rewardPool.money)} ₽ по урону · 🗡️ твой: <b>{fmt(world.myDamage)}</b></span>
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

      {seg === 'ring' && <RingPanel />}
      {seg === 'pvp' && (
      <Card>
        <div className="row">
          <div>
            <b>🥊 Наехать</b>
            <div className="muted small">💰 10% его денег · 🎖️ авторитет</div>
          </div>
          <button className="btn btn-red" disabled={busy || !pvpReady || lowHp} onClick={pvp}>
            {pvpReady ? `⚡${BALANCE.pvpEnergy}` : timeLeft(p.pvpReadyAt - now)}
          </button>
        </div>
        {p.shieldUntil > now && <div className="muted small">🛡️ Тебя не тронут ещё {timeLeft(p.shieldUntil - now)}</div>}
        {lowHp && <div className="warn">Здоровья меньше 30% — сначала в санчасть или подожди</div>}
      </Card>
      )}

      {seg === 'bosses' && lowHp && <div className="warn">Здоровья меньше 30% — сначала в санчасть или подожди</div>}
      {seg === 'bosses' && (
      <div className="boss-grid">
        {BOSSES.map((b) => {
          const locked = p.level < b.minLevel;
          const cd = (p.bossCd[b.id] ?? 0) - now;
          return (
            <div key={b.id} className={`boss-tile ${locked ? 'locked' : ''}`}>
              <NpcPortrait who={`sheet/boss/${b.id}`} className="boss-portrait" />
              <b>{b.name}</b>
              <small>
                ❤️{fmt(b.hp)} ⚔️{b.atk}
                {b.trait && <span className="boss-trait">{b.trait}</span>}
                {b.drops.length > 0 && ` ${b.drops.map((d) => itemById.get(d.itemId)?.emoji).join('')}`}
              </small>
              {locked ? (
                <span className="boss-lock">🔒 ур. {b.minLevel}</span>
              ) : cd > 0 ? (
                <button className="btn btn-s btn-gold" disabled={busy} onClick={() => act('bossReset', { bossId: b.id })}>
                  ⏳{timeLeft(cd)} · {GOLD_PRICES.bossReset}🪙
                </button>
              ) : (
                <button className="btn btn-s btn-red" disabled={busy || lowHp} onClick={() => boss(b.id, b.name)}>
                  В бой ⚡{b.energy}
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

/** Наезд на сокамерника — вызывается и с кнопки, и из диалога во дворе. */
export function usePvp() {
  const { act } = useGame();
  return async () => {
    await act('pvp');
  };
}
