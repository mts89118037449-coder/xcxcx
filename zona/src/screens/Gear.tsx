import { useState } from 'react';
import { ITEMS, RARITY_NAMES, SETS, SLOT_NAMES, TATTOOS, UPGRADE, itemById, rarityOf, upgradeCost, type Item, type Slot } from '../../shared/content.ts';
import { ItemIcon, TattooIcon } from '../art/Icons.tsx';
import { NpcBanner, PoseG } from '../art/sprites.tsx';
import { PerksPanel } from '../Perks.tsx';
import { BonusList, Card, Price, lookOf, useAnim, useGame } from '../game.tsx';

type View = 'mine' | 'shop' | 'ink' | 'perks';

/** Бонусы вещи с учётом улучшения у мастера. */
function scaled(i: Item, lvl: number): Item {
  if (!lvl) return i;
  const k = 1 + (lvl * UPGRADE.perLevel) / 100;
  const out = { ...i };
  for (const key of ['atk', 'def', 'hp', 'crit', 'energy', 'money'] as const) if (out[key]) out[key] = Math.round(out[key]! * k);
  return out;
}

export function Gear() {
  const { p, act, busy, toast } = useGame();
  const [view, setView] = useState<View>('mine');
  const [slot, setSlot] = useState<Slot | 'all'>('all');
  const [bare, setBare] = useState(false);
  const [anim, animKey, play] = useAnim();

  const dress = async (type: 'equip' | 'unequip', body: Record<string, unknown>) => {
    if ((await act(type, body)) !== null) play('act-dress');
  };

  const buy = async (item: Item) => {
    if (item.currency === 'gold' && !confirm(`Купить «${item.name}» за ${item.price} 🪙?`)) return;
    if ((await act('buy', { itemId: item.id })) === null) return;
    play('act-dress');
    toast(`${item.name} — твоё`);
  };

  const upgrade = async (item: Item) => {
    const lvl = p.upgrades[item.id] ?? 0;
    const c = upgradeCost(item, lvl);
    if (!confirm(`Мастер улучшит «${item.name}» до +${lvl + 1} (бонусы +${UPGRADE.perLevel * (lvl + 1)}%) за ${c.amount} ${c.currency === 'gold' ? '🪙' : '₽'}?`)) return;
    if ((await act('upgrade', { itemId: item.id })) !== null) toast(`🔧 ${item.name} +${lvl + 1}`);
  };

  const sell = async (item: Item) => {
    if (!confirm(`Продать «${item.name}»?`)) return;
    const r = await act<{ price: number }>('sell', { itemId: item.id });
    if (r) toast(`Продано за ${r.price} ₽`);
  };

  const slotTile = (s: Slot) => {
    const item = p.equipped[s] ? itemById.get(p.equipped[s]!) : null;
    return (
      <div key={s} className={`wslot ${item ? 'filled' : ''}`}>
        {item ? <ItemIcon id={item.id} size={42} /> : <span className="slot-empty" />}
        {item?.name ?? SLOT_NAMES[s]}
      </div>
    );
  };

  const shop = ITEMS.filter((i) => !i.bossOnly && (slot === 'all' || i.slot === slot));
  const mine = p.inventory.map((id) => itemById.get(id)).filter((i): i is Item => !!i);

  return (
    <>
      <div className="seg">
        <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>Надето</button>
        <button className={view === 'shop' ? 'active' : ''} onClick={() => setView('shop')}>Барахолка</button>
        <button className={view === 'ink' ? 'active' : ''} onClick={() => setView('ink')}>Наколки</button>
        <button className={view === 'perks' ? 'active' : ''} onClick={() => setView('perks')}>Перки</button>
      </div>

      {view === 'perks' && <PerksPanel />}

      {view === 'mine' && (
        <>
          <div className="wardrobe">
            <div className="wardrobe-col">{(['head', 'body', 'legs'] as Slot[]).map(slotTile)}</div>
            <div className="pose-wrap" onClick={() => setBare(!bare)}>
              {/* тап — раздеться по пояс и показать наколки */}
              <svg key={animKey} className="char-view" viewBox="0 -6 120 221">
                <PoseG name="stand" anim={anim === 'act-dress' ? 'flex' : undefined} look={lookOf(p)} bare={bare} />
              </svg>
            </div>
            <div className="wardrobe-col">{(['weapon', 'charm', 'feet'] as Slot[]).map(slotTile)}</div>
          </div>
          <div className="muted small center">Нажми на персонажа — {bare ? 'одеть' : 'снять верх и показать наколки'}</div>
          <h3 className="section">Комплекты</h3>
          <div className="sets">
            {SETS.map((set) => {
              const n = set.items.filter((id) => Object.values(p.equipped).includes(id)).length;
              return (
                <div key={set.id} className={`set-card ${n >= 2 ? 'on' : ''} ${n >= set.items.length ? 'full' : ''}`}>
                  <b>{set.name}</b>
                  <small>
                    {n}/{set.items.length} · {set.items.map((id) => itemById.get(id)?.emoji).join('')}
                  </small>
                  <div className="set-bonus">
                    <span className={n >= 2 ? 'on' : ''}>2: <BonusList b={set.two} /></span>
                    <span className={n >= set.items.length ? 'on' : ''}>
                      {set.items.length}: <BonusList b={set.full} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <h3 className="section">Инвентарь</h3>
          {mine.map((i) => {
            const on = p.equipped[i.slot] === i.id;
            return (
              <Card key={i.id} className={i.bossOnly ? 'epic' : ''}>
                <div className="row">
                  <div className="item-row">
                    <ItemIcon id={i.id} />
                    <div>
                      <b className={`rar-${rarityOf(i)}`}>
                        {i.name}
                        {(p.upgrades[i.id] ?? 0) > 0 && <span className="upg">+{p.upgrades[i.id]}</span>}
                      </b>{' '}
                      <span className="muted small">{SLOT_NAMES[i.slot]}</span>
                      <div><BonusList b={scaled(i, p.upgrades[i.id] ?? 0)} /></div>
                    </div>
                  </div>
                  <div className="row gap-s">
                    {on ? (
                      <button className="btn btn-s btn-dark" disabled={busy} onClick={() => dress('unequip', { slot: i.slot })}>Снять</button>
                    ) : (
                      <button className="btn btn-s" disabled={busy} onClick={() => dress('equip', { itemId: i.id })}>Надеть</button>
                    )}
                    {(p.upgrades[i.id] ?? 0) < UPGRADE.max && (
                      <button className="btn btn-s btn-dark" disabled={busy} onClick={() => upgrade(i)} title="Улучшить у мастера">
                        🔧
                      </button>
                    )}
                    {i.currency === 'money' && (
                      <button className="btn btn-s btn-dark" disabled={busy} onClick={() => sell(i)}>₽</button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {view === 'shop' && (
        <>
          <div className="chips">
            <button className={slot === 'all' ? 'active' : ''} onClick={() => setSlot('all')}>Всё</button>
            {(Object.keys(SLOT_NAMES) as Slot[]).map((s) => (
              <button key={s} className={slot === s ? 'active' : ''} onClick={() => setSlot(s)}>{SLOT_NAMES[s]}</button>
            ))}
          </div>
          {shop.map((i) => {
            const owned = p.inventory.includes(i.id);
            const locked = p.level < i.minLevel;
            return (
              <Card key={i.id} className={`${i.currency === 'gold' ? 'premium' : ''} ${locked ? 'locked' : ''}`}>
                <div className="row">
                  <div className="item-row">
                    <ItemIcon id={i.id} />
                    <div>
                      <b className={`rar-${rarityOf(i)}`}>{i.name}</b> <span className="muted small">{RARITY_NAMES[rarityOf(i)]}</span>
                      <div><BonusList b={i} /></div>
                      {locked && <div className="muted small">🔒 с {i.minLevel} уровня</div>}
                    </div>
                  </div>
                  <button className={`btn btn-s ${i.currency === 'gold' ? 'btn-gold' : ''}`} disabled={owned || locked || busy} onClick={() => buy(i)}>
                    {owned ? 'Есть' : <Price amount={i.price} currency={i.currency} />}
                  </button>
                </div>
              </Card>
            );
          })}
          <div className="muted small center">🎁 Лучшие вещи выпадают только с боссов</div>
        </>
      )}

      {view === 'ink' && (
        <>
          <NpcBanner who="kolshik" name="Кольщик Усатый" text="Каждая наколка — масть. Набью что заслужил, лишнего не наколю" />
          {TATTOOS.map((t) => {
            const has = p.tattoos.includes(t.id);
            const locked = p.level < t.minLevel || p.authority < t.minAuthority;
            return (
              <Card key={t.id} className={`${t.currency === 'gold' ? 'premium' : ''} ${locked && !has ? 'locked' : ''}`}>
                <div className="row">
                  <TattooIcon id={t.id} size={52} />
                  <div className="grow">
                    <b>{t.name}</b>
                    <div className="muted small">{t.meaning}</div>
                    <BonusList b={t} />
                    {locked && !has && (
                      <div className="muted small">🔒 ур. {t.minLevel}{t.minAuthority ? `, авторитет ${t.minAuthority}` : ''}</div>
                    )}
                  </div>
                  <button
                    className={`btn btn-s ${t.currency === 'gold' ? 'btn-gold' : ''}`}
                    disabled={has || locked || busy}
                    onClick={() => act('tattoo', { tattooId: t.id }).then((r) => r !== null && toast(`«${t.name}» набита!`))}
                  >
                    {has ? 'Набита' : <Price amount={t.price} currency={t.currency} />}
                  </button>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}
