import { useState } from 'react';
import { FURNITURE, GOLD_PRICES, TATTOOS, furnitureById } from '../../shared/content.ts';
import { CellShop, withPreview } from '../Cell.tsx';
import { StoryCard } from '../Leisure.tsx';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { CharacterEditor } from '../Editor.tsx';
import { InteriorPicker } from '../Interior.tsx';
import { BonusList, Price, fmt, lookOf, timeLeft, useAnim, useGame } from '../game.tsx';
import { SegBar, useSeg } from '../Seg.tsx';
import { DailyWeek, MastPicker, NotifyToggle, TermCard } from '../Term.tsx';
import { SoundSettings } from '../SoundSettings.tsx';
import { ReportButton } from '../Report.tsx';
import { chapterOf } from '../../shared/story.ts';


export function Home() {
  const { p, now, online, act, busy, go } = useGame();
  const talk = useTalk();
  const [bare, setBare] = useState(false);
  const [anim, animKey, play] = useAnim();
  const [seg, setSeg] = useSeg('home', p.faceChosen ? 'story' : 'look', ['story', 'look', 'cell', 'me'] as const);
  const panel = p.faceChosen ? seg : 'look';
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

  const [weekOpen, setWeekOpen] = useState(false);
  const [mastOpen, setMastOpen] = useState(false);
  const daily = () => setWeekOpen(true);

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
        <div className="scene-tag">🏚️ 🛋️{p.comfort} · ⛓️{p.term > 0 ? `${Math.ceil(p.term)} дн.` : 'УДО!'} · <span className="pulse" /> {fmt(online)}</div>
        {tryOn && (
          <div className="try-bar">
            <span>
              👀 {tryOn.emoji} {tryOn.name}
              <BonusList b={tryOn} />
            </span>
            <button className={`btn btn-s ${tryOn.currency === 'gold' ? 'btn-gold' : ''}`} data-tut={canBuy ? 'furnish' : undefined} disabled={busy || !canBuy} onClick={buyPreview}>
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
        {ink.length > 0 && !dailyReady && !tryOn && (
          <button className="scene-btn" onClick={() => setBare(!bare)}>
            {bare ? '👕' : '💪'}
          </button>
        )}
      </div>

      <SegBar
        value={panel}
        onChange={setSeg}
        items={[
          { id: 'story', icon: '📖', label: 'Сюжет', badge: p.story.progress >= (chapterOf(p.story.ch, p.mast)?.steps[p.story.step]?.n ?? Infinity) },
          { id: 'look', icon: '✏️', label: 'Облик', badge: !p.faceChosen },
          { id: 'cell', icon: '🛠️', label: 'Обустроить' },
          { id: 'me', icon: '📊', label: 'Профиль' },
        ]}
      />

      {panel === 'story' && (
        <>
          <StoryCard />
          <ul className="journal">
            {p.journal.slice(0, 5).map((j, i) => (
              <li key={i}>
                <small>{new Date(j.t).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
                {j.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {panel === 'look' && <CharacterEditor />}
      {panel === 'cell' && (
        <>
          <InteriorPicker />
          <CellShop onChange={() => play('act-cheer')} onPreview={showPreview} />
        </>
      )}
      {panel === 'me' && (
        <>
          <div className="rank-line">🎖️ {p.rank} · ур. {p.level}</div>
          <TermCard onMast={() => setMastOpen(true)} />
          <div className="stat-row">
            <div><span>⚔️</span>{p.stats.atk}<small>атака</small></div>
            <div><span>🛡️</span>{p.stats.def}<small>защита</small></div>
            <div><span>💥</span>{p.stats.crit}%<small>крит</small></div>
            <div><span>🎖️</span>{fmt(p.authority)}<small>авторитет</small></div>
            <div><span>🏆</span>#{p.place}<small>место</small></div>
            <div><span>🥊</span>{p.wins}/{p.losses}<small>драки</small></div>
          </div>
          <div className="row gap">
            <button className="btn btn-wide btn-dark" disabled={busy || p.hp >= p.stats.maxHp} onClick={() => act('heal')}>
              💉 Подлечиться · {GOLD_PRICES.heal} 🪙
            </button>
            <button className="btn btn-wide btn-dark" disabled={busy || p.energy >= p.stats.maxEnergy} onClick={() => act('refill')}>
              ☕ Энергия · {GOLD_PRICES.energyRefill} 🪙
            </button>
          </div>
          {!p.vipUntil && (
            <button className="vip-strip" onClick={() => go('shop')}>
              👑 Блатной статус: ⚡×2 · ₽+20% · 🪙10/день <b>Хочу</b>
            </button>
          )}
          {p.vipUntil && <div className="vip-strip on">👑 Блатной ещё {timeLeft(p.vipUntil - now)}</div>}
          <NotifyToggle />
          <SoundSettings />
          <ReportButton />
        </>
      )}
      {weekOpen && <DailyWeek onClose={() => { setWeekOpen(false); play('act-cheer'); }} />}
      {mastOpen && <MastPicker onClose={() => setMastOpen(false)} />}
    </>
  );
}
