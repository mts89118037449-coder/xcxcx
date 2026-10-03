import { useState } from 'react';
import { CELL_THEMES, FURNITURE, SPOTS, SPOT_BARE, SPOT_NAMES, furnitureById, themeCount, type Furniture, type Spot } from '../shared/content.ts';
import { BonusList, Price, useGame } from './game.tsx';

import { withPreview } from './cellPreview.ts';
export { withPreview };

/** Обустройство хаты: по каждому месту лестница улучшений и выбор, что поставить. Нажатие на вещь — примерка. */
export function CellShop({ onChange, onPreview }: { onChange(): void; onPreview(id: string | null): void }) {
  const { p, act, toast, busy } = useGame();
  const [spot, setSpot] = useState<Spot>('wall');
  const ladder = FURNITURE.filter((f) => f.spot === spot);
  const owned = (f: Furniture) => p.furniture.includes(f.id);
  const shown = p.cell.find((id) => ladder.some((f) => f.id === id)) ?? 'none';

  const buy = async (f: Furniture) => {
    if (f.currency === 'gold' && !confirm(`Поставить «${f.name}» за ${f.price} 🪙?`)) return;
    if ((await act('furnish', { furnitureId: f.id })) === null) return;
    onPreview(null);
    onChange();
    toast(`${f.emoji} ${f.name} — теперь в хате`);
  };
  const show = async (id: string) => {
    if ((await act('cellShow', { spot, id })) !== null) onChange();
  };

  return (
    <>
      <div className="row" style={{ margin: '16px 2px 8px' }}>
        <h3 className="section" style={{ margin: 0 }}>Обустройство</h3>
        <span className="muted small">🛋️ Уют {p.comfort}</span>
      </div>
      <div className="chips spot-chips">
        {SPOTS.map((s) => {
          const lad = FURNITURE.filter((f) => f.spot === s);
          const n = lad.filter((f) => p.furniture.includes(f.id)).length;
          const next = lad.find((f) => !p.furniture.includes(f.id));
          const can = next && next.minLevel <= p.level;
          return (
            <button key={s} className={`chip ${spot === s ? 'active' : ''}`} onClick={() => setSpot(s)}>
              {SPOT_NAMES[s]} <small>{n}/{lad.length}</small>
              {can && <i className="dot" />}
            </button>
          );
        })}
      </div>
      <div className="hscroll ladder">
        <div className={`ftile ${shown === 'none' ? 'shown' : ''}`} onClick={() => show('none')}>
          <span className="femoji">🧱</span>
          <b>{SPOT_BARE[spot]}</b>
          <span className="muted small">ничего не ставить</span>
          <span className="btn btn-s btn-dark">{shown === 'none' ? '✓ Сейчас' : 'Убрать всё'}</span>
        </div>
        {ladder.map((f, i) => {
          const have = owned(f);
          const prevOk = i === 0 || owned(ladder[i - 1]);
          const lvlOk = p.level >= f.minLevel;
          return (
            <div key={f.id} onClick={() => !have && onPreview(f.id)} className={`ftile ${!have ? 'try' : ''} ${have ? 'owned' : ''} ${shown === f.id ? 'shown' : ''} ${f.currency === 'gold' && !have ? 'premium' : ''}`}>
              <span className="femoji">{f.emoji}</span>
              <b>{f.name}</b>
              <span className="muted small">{have ? `ступень ${i + 1}` : '👀 примерить'}</span>
              <BonusList b={f} />
              {have ? (
                <button className="btn btn-s btn-dark" disabled={busy || shown === f.id} onClick={() => show(f.id)}>
                  {shown === f.id ? '✓ Стоит' : 'Поставить'}
                </button>
              ) : (
                <button className={`btn btn-s ${f.currency === 'gold' ? 'btn-gold' : ''}`} data-tut={prevOk && lvlOk && f.currency === 'money' && p.money >= f.price ? 'furnish' : undefined} disabled={busy || !prevOk || !lvlOk} onClick={(e) => { e.stopPropagation(); buy(f); }}>
                  {!lvlOk ? `🔒 ур. ${f.minLevel}` : !prevOk ? '🔒 сначала прошлое' : <Price amount={f.price} currency={f.currency} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="muted small center">Бонусы всех купленных ступеней складываются, даже если вещь убрана.</div>
      <h3 className="section">Стиль хаты</h3>
      <div className="muted small">Поставь вещи одного стиля — хата даст бонус сверху. Считается то, что стоит в сцене.</div>
      <div className="themes">
        {CELL_THEMES.map((t) => {
          const n = themeCount(t, p.cell);
          const on = n >= t.need;
          const missing = t.groups.filter((g) => !g.some((id) => p.cell.includes(id))).map((g) => furnitureById.get(g[g.length - 1])?.emoji ?? '');
          return (
            <div key={t.id} className={`theme ${on ? 'on' : ''}`}>
              <span className="theme-emoji">{t.emoji}</span>
              <div className="grow">
                <b>{t.name}</b>
                <div className="theme-bar">
                  <div style={{ width: `${Math.min(1, n / t.need) * 100}%` }} />
                  <span>
                    {n}/{t.need}
                  </span>
                </div>
                {!on && <small className="muted">не хватает: {missing.slice(0, 6).join(' ')}</small>}
              </div>
              <BonusList b={t.bonus} />
            </div>
          );
        })}
      </div>
    </>
  );
}
