import { useState } from 'react';
import { itemById } from '../shared/content.ts';
import { MATS, RECIPES, matById, type MatId, type Recipe } from '../shared/craft.ts';
import { consumableById } from '../shared/perks.ts';
import { repRank } from '../shared/factions.ts';
import { ItemIcon } from './art/Icons.tsx';
import { NpcBanner } from './art/sprites.tsx';
import { BonusList, useGame } from './game.tsx';

/** Ремесло: запас материалов сверху, ниже рецепты — что есть, чего не хватает. */
export function CraftPanel() {
  const { p, act, busy, toast } = useGame();
  const [only, setOnly] = useState(false);
  const has = (r: Recipe) => (Object.entries(r.mats) as [MatId, number][]).every(([id, n]) => (p.mats[id] ?? 0) >= n);
  const list = RECIPES.filter((r) => !only || (has(r) && p.level >= r.minLevel));

  const make = async (r: Recipe) => {
    const res = await act<{ item: string | null; gear: string | null; n: number; rep: number }>('craft', { recipe: r.id });
    if (!res) return;
    const name = res.gear ? itemById.get(res.gear)?.name : consumableById.get(res.item!)?.name;
    toast(`🔧 ${name}${res.n > 1 ? ` ×${res.n}` : ''} · ⚒️ +${res.rep}`);
  };

  return (
    <>
      <NpcBanner who="worker" name="Мастер Палыч" text="Руки есть — будет и вещь. Материал носи с промки, кухни и с передач" />
      <div className="mats">
        {MATS.map((m) => (
          <div key={m.id} className={`mat ${(p.mats[m.id] ?? 0) > 0 ? '' : 'none'}`}>
            <span>{m.emoji}</span>
            <b>{p.mats[m.id] ?? 0}</b>
            <small>{m.name}</small>
          </div>
        ))}
      </div>
      <div className="muted small center">
        Материалы: промка, столовая, библиотека, свиданка, смены и боссы.{repRank(p.rep.work) >= 3 ? ' ⚒️ Мастеровой: вдвое больше.' : ''}
      </div>
      <div className="chips">
        <button className={!only ? 'active' : ''} onClick={() => setOnly(false)}>
          Все рецепты
        </button>
        <button className={only ? 'active' : ''} onClick={() => setOnly(true)}>
          Можно сделать
        </button>
      </div>
      <div className="recipes">
        {list.map((r) => {
          const gear = r.out.gear ? itemById.get(r.out.gear) : null;
          const cons = r.out.item ? consumableById.get(r.out.item) : null;
          const owned = !!gear && p.inventory.includes(gear.id);
          const lvl = p.level >= r.minLevel;
          const ok = has(r) && lvl && !owned;
          return (
            <div key={r.id} className={`recipe ${gear ? 'epic' : ''} ${ok ? 'ready' : ''}`}>
              <div className="recipe-out">
                {gear ? <ItemIcon id={gear.id} size={44} /> : <span className="recipe-emoji">{cons?.emoji}</span>}
                {(r.out.n ?? 1) > 1 && <i>×{r.out.n}</i>}
              </div>
              <div className="grow">
                <b>{r.name}</b>
                {gear ? <BonusList b={gear} /> : <small className="muted">{cons?.desc}</small>}
                <div className="recipe-mats">
                  {(Object.entries(r.mats) as [MatId, number][]).map(([id, n]) => (
                    <span key={id} className={(p.mats[id] ?? 0) >= n ? 'ok' : 'no'}>
                      {matById.get(id)!.emoji} {p.mats[id] ?? 0}/{n}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-s" disabled={busy || !ok} onClick={() => make(r)}>
                {owned ? 'Есть' : !lvl ? `🔒 ${r.minLevel} ур.` : 'Сделать'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
