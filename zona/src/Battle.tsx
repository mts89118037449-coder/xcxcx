import { useCallback, useState } from 'react';
import { itemById } from '../shared/content.ts';
import { consumableById, perkById } from '../shared/perks.ts';
import type { BattleView, FightReplay } from '../shared/types.ts';
import { BOSS_LOOKS } from './art/Character.tsx';
import { FightArena } from './art/FightArena.tsx';
import { itemLabel } from './Perks.tsx';
import { lookOf, useGame } from './game.tsx';
import { tg } from './api.ts';

interface Final {
  win: boolean;
  reward: { money?: number; xp?: number; authority?: number; gold?: number; drop?: string | null; item?: string | null };
  used: string[];
}

/** Пошаговая драка: игрок жмёт удар, перки и расходники, противник отвечает сам. */
export function BattleModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  // снимок боя: после конца p.battle пропадает, а экран итогов ещё нужен
  const [view, setView] = useState<BattleView>(() => p.battle!);
  const [rounds, setRounds] = useState(() => p.battle!.rounds);
  const [startAt] = useState(() => p.battle!.rounds.length);
  const [final, setFinal] = useState<Final | null>(null);
  const [anim, setAnim] = useState(false); // ходы ещё проигрываются
  const [shown, setShown] = useState(false); // итог показан после анимации

  const onCaught = useCallback(() => {
    setAnim(false);
    setShown(true);
  }, []);

  const send = async (body: Record<string, unknown>) => {
    tg?.HapticFeedback?.impactOccurred('medium');
    const r = await act<{ rounds: BattleView['rounds']; battle?: BattleView; done?: boolean } & Partial<Final>>('battle', body);
    if (!r) return;
    setAnim(r.rounds.length > 0);
    setShown(false);
    setRounds((old) => [...old, ...r.rounds]);
    if (r.battle) setView(r.battle);
    if (r.done) {
      setFinal({ win: !!r.win, reward: r.reward ?? {}, used: r.used ?? [] });
      tg?.HapticFeedback?.notificationOccurred(r.win ? 'success' : 'error');
    }
  };

  const enemy = view.enemy.npc
    ? { name: view.enemy.name, npc: view.enemy.npc, ...BOSS_LOOKS[view.enemy.npc] }
    : { name: view.enemy.name, look: view.enemy.look ?? { equipped: {}, tattoos: [], str: 10 } };
  const replay: FightReplay = { win: !!final?.win, log: [], rounds, startHp: view.startHp, maxHp: view.maxHp };
  const over = !!final;
  const locked = busy || anim || over;
  const drop = final?.reward.drop ? itemById.get(final.reward.drop) : null;

  return (
    <div className="modal">
      <div className="modal-body battle-body">
        <FightArena me={{ name: p.name, look: lookOf(p) }} enemy={enemy} replay={replay} onDone={onCaught} final={over} startAt={startAt} />
        {!over && (
          <div className="battle-bar">
            <button className="bt-hit" disabled={locked} onClick={() => send({ act: 'hit' })}>
              <span>👊</span>Удар
            </button>
            {view.perks
              .filter((x) => !x.passive)
              .map((x) => {
                const perk = perkById.get(x.id)!;
                return (
                  <button key={x.id} className={`bt-perk ${x.usable ? 'ready' : ''}`} disabled={locked || !x.usable} onClick={() => send({ act: 'perk', id: x.id })}>
                    <span>{perk.emoji}</span>
                    {perk.name.replace(/\s[IVX]+$/, '')}
                    {!x.usable && <i>{x.spent ? '✓' : x.cdLeft > 0 ? x.cdLeft : '—'}</i>}
                  </button>
                );
              })}
            {view.items.map((id) => {
              const c = consumableById.get(id)!;
              const reactive = c.kind === 'revive';
              return (
                <button key={id} className="bt-item" disabled={locked || reactive} onClick={() => send({ act: 'item', id })} title={c.desc}>
                  <span>{c.emoji}</span>
                  {reactive ? 'сам' : c.name.split(' ')[0]}
                </button>
              );
            })}
            <button className="bt-auto" disabled={locked} onClick={() => send({ act: 'auto' })}>
              <span>⏩</span>Авто
            </button>
          </div>
        )}
        {!over && view.perks.some((x) => x.passive) && (
          <div className="bt-passive">
            {view.perks
              .filter((x) => x.passive)
              .map((x) => perkById.get(x.id)!)
              .map((perk) => (
                <span key={perk.id}>{perk.emoji}</span>
              ))}
            <small>работают сами</small>
          </div>
        )}
        {over && shown && (
          <div className="result-in">
            <h2 className={final!.win ? 'win' : 'lose'}>{final!.win ? '🏆 Победа' : '💀 Поражение'}</h2>
            {(drop || final!.used.length > 0) && (
              <div className="rewards">
                {drop && <div>🎁 {drop.emoji} {drop.name}</div>}
                {final!.used.length > 0 && <div className="muted small">{final!.used.map(itemLabel).join(' ')}</div>}
              </div>
            )}
            <button className="btn btn-wide" onClick={onClose}>
              Ясно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
