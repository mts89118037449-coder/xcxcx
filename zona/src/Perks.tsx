import { useState } from 'react';
import { CONSUMABLES, CONSUMABLE_SLOTS, PERKS, PERK_SLOTS, consumableById, perkById, type Perk } from '../shared/perks.ts';
import { Card, Price, useGame } from './game.tsx';

const RARITY = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический' } as const;

/** Перки (3 из 100) и пояс расходников (3 из 20). */
export function PerksPanel() {
  const { p, act, busy, toast } = useGame();
  const [pick, setPick] = useState<Perk | null>(null);
  const [tab, setTab] = useState<'perks' | 'belt'>('perks');

  // перки сгруппированы по типу: 12 рядов по 8 ступеней + легенды
  const rows: Perk[][] = [];
  for (const perk of PERKS) {
    const key = perk.kind === 'legend' ? 'legend' : perk.kind;
    const row = rows.find((r) => (r[0].kind === 'legend' ? 'legend' : r[0].kind) === key);
    if (row) row.push(perk);
    else rows.push([perk]);
  }
  const kindOf = (x: Perk) => (x.kind === 'legend' ? x.id : x.kind);

  const togglePerk = async (perk: Perk) => {
    const on = p.perks.includes(perk.id);
    let next = p.perks.filter((id) => id !== perk.id);
    if (!on) {
      // тот же тип — заменяем ступень, иначе занимаем свободный слот
      next = next.filter((id) => kindOf(perkById.get(id)!) !== kindOf(perk));
      if (next.length >= PERK_SLOTS) return toast(`Слотов только ${PERK_SLOTS} — сними лишний`, 'err');
      next.push(perk.id);
    }
    if ((await act('perks', { ids: next })) !== null) toast(on ? `Снят: ${perk.name}` : `В деле: ${perk.name}`);
  };

  const toggleBelt = async (id: string) => {
    const on = p.belt.includes(id);
    const next = on ? p.belt.filter((x) => x !== id) : [...p.belt, id];
    if (next.length > CONSUMABLE_SLOTS) return toast(`На поясе только ${CONSUMABLE_SLOTS} места`, 'err');
    await act('belt', { ids: next });
  };

  const buy = async (id: string) => {
    const c = consumableById.get(id)!;
    if (c.currency === 'gold' && !confirm(`Купить «${c.name}» за ${c.price} 🪙?`)) return;
    if ((await act('buyItem', { id, n: 1 })) !== null) toast(`${c.emoji} ${c.name} — в мешке`);
  };

  const unlocked = PERKS.filter((x) => x.minLevel <= p.level).length;

  return (
    <>
      <div className="loadout">
        {Array.from({ length: PERK_SLOTS }, (_, i) => {
          const perk = p.perks[i] ? perkById.get(p.perks[i]) : null;
          return (
            <div key={`p${i}`} className={`lslot perk ${perk ? 'filled' : ''}`} onClick={() => perk && setPick(perk)}>
              <span>{perk?.emoji ?? '＋'}</span>
              <small>{perk?.name ?? 'Перк'}</small>
            </div>
          );
        })}
        {Array.from({ length: CONSUMABLE_SLOTS }, (_, i) => {
          const c = p.belt[i] ? consumableById.get(p.belt[i]) : null;
          const n = c ? p.stash[c.id] ?? 0 : 0;
          return (
            <div key={`c${i}`} className={`lslot belt ${c ? 'filled' : ''} ${c && !n ? 'empty' : ''}`} onClick={() => setTab('belt')}>
              <span>{c?.emoji ?? '＋'}</span>
              <small>{c ? `${c.name} ×${n}` : 'Пояс'}</small>
            </div>
          );
        })}
      </div>

      <div className="seg seg-s">
        <button className={tab === 'perks' ? 'active' : ''} onClick={() => setTab('perks')}>Перки {unlocked}/100</button>
        <button className={tab === 'belt' ? 'active' : ''} onClick={() => setTab('belt')}>Расходники</button>
      </div>

      {tab === 'perks' && (
        <>
          <div className="muted small center">
            Открываются с уровнем. В бой берёшь {PERK_SLOTS}, по одному каждого типа. У активных — перезарядка в ходах.
          </div>
          <div className="perk-grid">
            {rows.map((row) => (
              <div key={row[0].id} className="perk-row">
                {row.map((x) => {
                  const open = x.minLevel <= p.level;
                  const on = p.perks.includes(x.id);
                  return (
                    <button
                      key={x.id}
                      className={`perk-chip ${open ? '' : 'locked'} ${on ? 'on' : ''} ${pick?.id === x.id ? 'sel' : ''} ${x.kind === 'legend' ? 'legend' : ''}`}
                      onClick={() => setPick(x)}
                    >
                      <span>{x.emoji}</span>
                      <i>{open ? (x.kind === 'legend' ? '★' : x.tier) : x.minLevel}</i>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {pick && (
            <Card className={`perk-card ${pick.kind === 'legend' ? 'epic' : ''}`}>
              <div className="row">
                <div className="item-row">
                  <span className="perk-big">{pick.emoji}</span>
                  <div>
                    <b>{pick.name}</b>
                    <div className="small">{pick.desc}</div>
                    <div className="muted small">
                      {pick.cd === 0 ? 'Пассивный' : pick.cd < 0 ? 'Раз за бой' : `Откат ${pick.cd} ход.`} · с {pick.minLevel} ур.
                    </div>
                  </div>
                </div>
                {pick.minLevel <= p.level ? (
                  <button className={`btn btn-s ${p.perks.includes(pick.id) ? 'btn-dark' : ''}`} disabled={busy} onClick={() => togglePerk(pick)}>
                    {p.perks.includes(pick.id) ? 'Снять' : 'Взять'}
                  </button>
                ) : (
                  <span className="tag">🔒 {pick.minLevel} ур.</span>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'belt' && (
        <>
          <div className="muted small center">
            Одноразовые: срабатывают в бою и сгорают. Находятся на боссах и в наездах, дают за дела, поручения, неделю и исповедь.
          </div>
          {CONSUMABLES.map((c) => {
            const n = p.stash[c.id] ?? 0;
            const on = p.belt.includes(c.id);
            return (
              <Card key={c.id} className={c.rarity === 'epic' ? 'epic' : ''}>
                <div className="row">
                  <div className="item-row">
                    <span className={`perk-big rar-${c.rarity}`}>{c.emoji}</span>
                    <div>
                      <b>{c.name}</b> <span className="muted small">×{n}</span>
                      <div className="small">{c.desc}</div>
                      <div className="muted small">{RARITY[c.rarity]}{c.price ? '' : ' · только найти'}</div>
                    </div>
                  </div>
                  <div className="col-s">
                    {(n > 0 || on) && (
                      <button className={`btn btn-s ${on ? 'btn-dark' : ''}`} disabled={busy} onClick={() => toggleBelt(c.id)}>
                        {on ? 'С пояса' : 'На пояс'}
                      </button>
                    )}
                    {c.price > 0 && (
                      <button className={`btn btn-s ${c.currency === 'gold' ? 'btn-gold' : 'btn-dark'}`} disabled={busy} onClick={() => buy(c.id)}>
                        <Price amount={c.price} currency={c.currency} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}

/** «🩹 Бинт» — для тостов и итогов боя. */
import { itemLabel } from './itemLabel.ts';
export { itemLabel };

/** Строки итога боя про расходники: что потрачено и что нашлось. */
export function itemLines(used: string[] | undefined, found: string | null | undefined): string[] {
  return [
    ...(found ? [`🎒 Нашёл: ${itemLabel(found)}`] : []),
    ...(used?.length ? [`Потрачено: ${used.map(itemLabel).join(', ')}`] : []),
  ];
}
