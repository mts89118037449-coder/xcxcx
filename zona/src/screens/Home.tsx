import { useState } from 'react';
import { FURNITURE, GOLD_PRICES, TATTOOS, furnitureById } from '../../shared/content.ts';
import { CellShop, withPreview } from '../Cell.tsx';
import { StoryCard } from '../Leisure.tsx';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { CharacterEditor } from '../Editor.tsx';
import { InteriorPicker } from '../Interior.tsx';
import { usePoses } from '../art/sprites.tsx';
import { BonusList, Price, fmt, lookOf, timeLeft, useAnim, useGame } from '../game.tsx';

type Panel = 'look' | 'cell' | null;

export function Home() {
  const { p, now, online, act, busy, go } = useGame();
  const talk = useTalk();
  const [bare, setBare] = useState(false);
  const poses = usePoses();
  const [anim, animKey, play] = useAnim();
  const [panel, setPanel] = useState<Panel>(p.faceChosen ? null : 'look');
  const [preview, setPreview] = useState<string | null>(null);
  const tryOn = preview ? furnitureById.get(preview) : null;
  const tryIdx = tryOn ? FURNITURE.filter((f) => f.spot === tryOn.spot).indexOf(tryOn) : 0;
  const tryPrev = tryOn && tryIdx > 0 ? FURNITURE.filter((f) => f.spot === tryOn.spot)[tryIdx - 1] : null;
  const canBuy = tryOn && p.level >= tryOn.minLevel && (!tryPrev || p.furniture.includes(tryPrev.id));
  const buyPreview = async () => {
    if (!tryOn) return;
    if (tryOn.currency === 'gold' && !confirm(`Поставить «${tryOn.name}» за ${tryOn.price} 🪙?`)) return;
    if ((await act('furnish', { furnitureId: tryOn.id })) === null) return;
    setPreview(null);
    play('act-cheer');
  };
  const showPreview = (id: string | null) => {
    setPreview(id);
    if (id) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const dailyReady = now >= p.dailyReadyAt;
  const ink = TATTOOS.filter((t) => p.tattoos.includes(t.id));
  const hurt = p.hp < p.stats.maxHp * 0.3;

  const daily = async () => {
    if ((await act('daily')) !== null) play('act-cheer');
  };
  const toggle = (x: Panel) => setPanel(panel === x ? null : x);

  return (
    <>
      <div className="scene-wrap">
        <Stage
          onTalk={talk}
          loc="cell"
          look={lookOf(p)}
          bare={bare}
          mood={hurt ? 'hurt' : 'idle'}
          furniture={withPreview(p.cell, preview)}
          interior={p.interior}
          anim={anim}
          animKey={animKey}
          onClick={() => play('act-cheer')}
        />
        <div className="scene-tag">🏚️ 🛋️{p.comfort} · <span className="pulse" /> {fmt(online)}</div>
        {tryOn && (
          <div className="try-bar">
            <span>
              👀 {tryOn.emoji} {tryOn.name}
              <BonusList b={tryOn} />
            </span>
            <button className={`btn btn-s ${tryOn.currency === 'gold' ? 'btn-gold' : ''}`} disabled={busy || !canBuy} onClick={buyPreview}>
              {!canBuy ? (p.level < tryOn.minLevel ? `🔒 ур. ${tryOn.minLevel}` : `🔒 ${tryPrev?.name}`) : <Price amount={tryOn.price} currency={tryOn.currency} />}
            </button>
            <button className="btn btn-s btn-dark" onClick={() => setPreview(null)}>✕</button>
          </div>
        )}
        {dailyReady && !tryOn && (
          <button className="scene-btn scene-gift" disabled={busy} onClick={daily}>
            📦 Грев
          </button>
        )}
        {ink.length > 0 && !poses && !dailyReady && (
          <button className="scene-btn" onClick={() => setBare(!bare)}>
            {bare ? '👕' : '💪'}
          </button>
        )}
      </div>

      <div className="icon-row">
        <button className={`icon-tile ${panel === 'look' ? 'on' : ''} ${p.faceChosen ? '' : 'glow'}`} onClick={() => toggle('look')}>
          <span>✏️</span>Внешность
        </button>
        <button className={`icon-tile ${panel === 'cell' ? 'on' : ''}`} onClick={() => toggle('cell')}>
          <span>🛠️</span>Обустроить
        </button>
        <button className="icon-tile" disabled={busy || p.hp >= p.stats.maxHp} onClick={() => act('heal')}>
          <span>💉</span>{GOLD_PRICES.heal} 🪙
        </button>
        <button className="icon-tile" disabled={busy || p.energy >= p.stats.maxEnergy} onClick={() => act('refill')}>
          <span>☕</span>{GOLD_PRICES.energyRefill} 🪙
        </button>
      </div>

      <StoryCard />
      {panel === 'look' && <CharacterEditor />}
      {panel === 'cell' && (
        <>
          <InteriorPicker />
          <CellShop onChange={() => play('act-cheer')} onPreview={showPreview} />
        </>
      )}

      <div className="stat-row">
        <div><span>⚔️</span>{p.stats.atk}</div>
        <div><span>🛡️</span>{p.stats.def}</div>
        <div><span>💥</span>{p.stats.crit}%</div>
        <div><span>🎖️</span>{fmt(p.authority)}</div>
        <div><span>🏆</span>#{p.place}</div>
        <div><span>🥊</span>{p.wins}/{p.losses}</div>
      </div>

      {!p.vipUntil && (
        <button className="vip-strip" onClick={() => go('shop')}>
          👑 Блатной статус: ⚡×2 · ₽+20% · 🪙10/день <b>Хочу</b>
        </button>
      )}
      {p.vipUntil && <div className="vip-strip on">👑 Блатной ещё {timeLeft(p.vipUntil - now)}</div>}

      <ul className="journal">
        {p.journal.slice(0, 4).map((j, i) => (
          <li key={i}>
            <small>{new Date(j.t).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
            {j.text}
          </li>
        ))}
      </ul>
    </>
  );
}
