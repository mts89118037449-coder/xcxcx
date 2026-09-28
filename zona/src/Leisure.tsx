import { STORY } from '../shared/story.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { useGame } from './game.tsx';

/** Чем заняться без энергии: плитки с остатком на сегодня. */
export function Leisure() {
  const { p, now, openMini, openPlace, openShells, go } = useGame();
  const tiles = [
    { icon: '🃏', name: 'Очко', left: p.games.cards, on: () => openMini('cards') },
    { icon: '🪳', name: 'Бега', left: p.games.race, on: () => openMini('race') },
    { icon: '☕', name: 'Чифир', left: p.games.brew, on: () => openMini('brew'), wait: p.games.brewReadyAt > now },
    { icon: '🥜', name: 'Напёрстки', left: p.shellsLeft, on: openShells },
    { icon: '💪', name: 'Турник', left: p.pullupsLeft, on: () => openPlace('pullups') },
    { icon: '⛪', name: 'Церковь', left: null, on: () => openPlace('church') },
    { icon: '🚶', name: 'Двор', left: now >= p.yardReadyAt ? 1 : 0, on: () => go('fight') },
    { icon: '🕳️', name: 'Побег', left: p.escape.cdUntil > now ? 0 : null, on: () => openPlace('escape') },
  ];
  return (
    <div className="leisure">
      {tiles.map((t) => (
        <button key={t.name} className={`leisure-tile ${t.left === 0 || t.wait ? 'spent' : ''}`} onClick={t.on}>
          <span>{t.icon}</span>
          {t.name}
          {t.left != null && t.left > 0 && <i>{t.left}</i>}
        </button>
      ))}
    </div>
  );
}

/** Сюжет: кто ведёт главу, текущий шаг и прогресс. */
export function StoryCard() {
  const { p, act, busy } = useGame();
  const ch = STORY[p.story.ch];
  const step = ch?.steps[p.story.step];
  const npc = useNpc(ch?.who ?? '');
  if (!ch || !step) return null;
  const ready = p.story.progress >= step.n;
  const r = step.reward;
  const reward = [r.money && `₽${r.money}`, r.xp && `⭐${r.xp}`, r.gold && `🪙${r.gold}`, r.butts && `🚬${r.butts}`, r.item && '🎁'].filter(Boolean).join(' ');
  return (
    <div className={`story ${ready ? 'ready' : ''}`}>
      {npc && <NpcPortrait who={ch.who} className="story-pic" />}
      <div className="story-body">
        <small>
          📖 {ch.name} · {p.story.step + 1}/{ch.steps.length}
        </small>
        <b>{step.text}</b>
        <div className="story-bar">
          <div style={{ width: `${(p.story.progress / step.n) * 100}%` }} />
          <span>
            {p.story.progress}/{step.n}
          </span>
        </div>
      </div>
      <button className={`btn btn-s ${ready ? '' : 'btn-dark'}`} disabled={!ready || busy} onClick={() => act('story')}>
        {ready ? 'Забрать' : reward}
      </button>
    </div>
  );
}
