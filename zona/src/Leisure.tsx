import { PLACES } from '../shared/places.ts';
import { chapterOf } from '../shared/story.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { useGame } from './game.tsx';

interface Tile {
  icon: string;
  name: string;
  left: number | null;
  wait?: boolean;
  on(): void;
}

function Tiles({ tiles }: { tiles: Tile[] }) {
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

/** Мини-игры без энергии: плитки с остатком на сегодня. */
export function GameTiles() {
  const { p, now, openMini, openShells } = useGame();
  return (
    <Tiles
      tiles={[
        { icon: '🃏', name: 'Очко', left: p.games.cards, on: () => openMini('cards') },
        { icon: '🪳', name: 'Бега', left: p.games.race, on: () => openMini('race') },
        { icon: '☕', name: 'Чифир', left: p.games.brew, on: () => openMini('brew'), wait: p.games.brewReadyAt > now },
        { icon: '🥜', name: 'Напёрстки', left: p.shellsLeft, on: openShells },
        { icon: '🎲', name: 'Кости', left: p.games.dice, on: () => openMini('dice') },
        { icon: '💪', name: 'Армрестлинг', left: p.games.arm, on: () => openMini('arm') },
        { icon: '🎯', name: 'Мишень', left: p.games.darts, on: () => openMini('darts') },
        { icon: '🎲', name: 'Нарды', left: p.games.nardy, on: () => openMini('nardy'), wait: false },
        { icon: '🁫', name: 'Домино', left: p.games.domino, on: () => openMini('domino') },
        { icon: '♟️', name: 'Этюд', left: p.games.chess, on: () => openMini('chess') },
        { icon: '⚡', name: 'Чифир на скорость', left: p.games.speed, on: () => openMini('speed') },
        { icon: '📦', name: 'Конвейер', left: p.games.conveyor, on: () => openMini('conveyor') },
        { icon: '📿', name: 'Чётки', left: p.games.beads, on: () => openMini('beads'), wait: p.games.beadsReadyAt > now },
        { icon: '🎣', name: 'Рыбалка', left: p.games.fish, on: () => openMini('fish') },
        { icon: '🧱', name: 'Выжить в ШИЗО', left: p.tables.shizo ? null : p.games.shizo, on: () => openMini('shizo') },
      ]}
    />
  );
}

/** Куда сходить по зоне. */
export function PlaceTiles() {
  const { p, now, openPlace, go, visit, toast } = useGame();
  return (
    <Tiles
      tiles={[
        { icon: '🚶', name: 'Двор', left: now >= p.yardReadyAt ? 1 : 0, on: () => go('fight') },
        { icon: '🏚️', name: 'По хатам', left: p.snoopsLeft ?? null, on: () => visit(0) },
        { icon: '💪', name: 'Турник', left: p.pullupsLeft, on: () => openPlace('pullups') },
        { icon: '⛪', name: 'Церковь', left: null, on: () => openPlace('church') },
        { icon: '🏥', name: 'Санчасть', left: null, on: () => openPlace('medic') },
        ...PLACES.map((pl) => {
          const ready = pl.activities.filter((a) => (p.placeCd[`${pl.id}.${a.id}`] ?? 0) <= now).length;
          const locked = p.level < pl.minLevel;
          return {
            icon: locked ? '🔒' : pl.icon,
            name: locked ? `${pl.name} · ${pl.minLevel} ур.` : pl.name,
            left: locked ? 0 : ready,
            on: () => (locked ? toast(`${pl.name} — с ${pl.minLevel} уровня`) : openPlace(pl.id)),
          };
        }),
        { icon: '🕳️', name: 'Побег', left: p.escape.cdUntil > now ? 0 : null, on: () => openPlace('escape') },
      ]}
    />
  );
}

/** Сюжет: кто ведёт главу, текущий шаг и прогресс. */
export function StoryCard() {
  const { p, act, busy } = useGame();
  const ch = chapterOf(p.story.ch, p.mast);
  const step = ch?.steps[p.story.step];
  const npc = useNpc(ch?.who ?? '');
  if (!ch || !step) return null;
  const ready = p.story.progress >= step.n;
  const r = step.reward;
  const reward = [r.money && `₽${r.money}`, r.xp && `⭐${r.xp}`, r.gold && `🪙${r.gold}`, r.butts && `🚬${r.butts}`, r.item && '🎁', r.gear && '👕'].filter(Boolean).join(' ');
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
