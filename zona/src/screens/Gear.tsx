import { useState } from 'react';
import { ITEMS, SLOT_NAMES, TATTOOS, itemById, type Item, type Slot } from '../../shared/content.ts';
import { BonusList, Card, Price, useGame } from '../game.tsx';

type View = 'mine' | 'shop' | 'ink';

export function Gear() {
  const { p, act, busy, toast } = useGame();
  const [view, setView] = useState<View>('mine');
  const [slot, setSlot] = useState<Slot | 'all'>('all');

  const buy = async (item: Item) => {
    if (item.currency === 'gold' && !confirm(`Купить «${item.name}» за ${item.price} 🪙?`)) return;
    if ((await act('buy', { itemId: item.id })) !== null) toast(`${item.emoji} ${item.name} — твоё`);
  };

  const sell = async (item: Item) => {
    if (!confirm(`Продать «${item.name}»?`)) return;
    const r = await act<{ price: number }>('sell', { itemId: item.id });
    if (r) toast(`Продано за ${r.price} ₽`);
  };

  const shop = ITEMS.filter((i) => !i.bossOnly && (slot === 'all' || i.slot === slot));
  const mine = p.inventory.map((id) => itemById.get(id)).filter((i): i is Item => !!i);

  return (
    <>
      <div className="seg">
        <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>Надето</button>
        <button className={view === 'shop' ? 'active' : ''} onClick={() => setView('shop')}>Барахолка</button>
        <button className={view === 'ink' ? 'active' : ''} onClick={() => setView('ink')}>Наколки</button>
      </div>

      {view === 'mine' && (
        <>
          <Card>
            <div className="slots">
              {(Object.keys(SLOT_NAMES) as Slot[]).map((s) => {
                const item = p.equipped[s] ? itemById.get(p.equipped[s]!) : null;
                return (
                  <div key={s} className={`slot ${item ? 'filled' : ''}`}>
                    <span className="slot-emoji">{item?.emoji ?? '▫️'}</span>
                    <small>{item?.name ?? SLOT_NAMES[s]}</small>
                  </div>
                );
              })}
            </div>
          </Card>
          <h3 className="section">Инвентарь</h3>
          {mine.map((i) => {
            const on = p.equipped[i.slot] === i.id;
            return (
              <Card key={i.id} className={i.bossOnly ? 'epic' : ''}>
                <div className="row">
                  <div>
                    <b>{i.emoji} {i.name}</b> <span className="muted small">{SLOT_NAMES[i.slot]}</span>
                    <div><BonusList b={i} /></div>
                  </div>
                  <div className="row gap-s">
                    {on ? (
                      <button className="btn btn-s btn-dark" disabled={busy} onClick={() => act('unequip', { slot: i.slot })}>Снять</button>
                    ) : (
                      <button className="btn btn-s" disabled={busy} onClick={() => act('equip', { itemId: i.id })}>Надеть</button>
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
                  <div>
                    <b>{i.emoji} {i.name}</b>
                    <div><BonusList b={i} /></div>
                    {locked && <div className="muted small">🔒 с {i.minLevel} уровня</div>}
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
          <div className="muted small center">Наколки дают постоянные бонусы и показывают масть</div>
          {TATTOOS.map((t) => {
            const has = p.tattoos.includes(t.id);
            const locked = p.level < t.minLevel || p.authority < t.minAuthority;
            return (
              <Card key={t.id} className={`${t.currency === 'gold' ? 'premium' : ''} ${locked && !has ? 'locked' : ''}`}>
                <div className="row">
                  <div className="boss-emoji">{t.emoji}</div>
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
                    onClick={() => act('tattoo', { tattooId: t.id }).then((r) => r !== null && toast(`${t.emoji} Набито!`))}
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
