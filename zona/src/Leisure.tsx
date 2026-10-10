import { PLACES } from '../shared/places.ts';
import { unlockById } from '../shared/unlocks.ts';
import { chapterOf } from '../shared/story.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { useGame } from './game.tsx';

interface Tile {
  icon: string;
  name: string;
  left: number | null;
  wait?: boolean;
  locked?: boolean;
  on(): void;
}

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="leisure">
      {tiles.map((t) => (
        <button key={t.name} className={`leisure-tile ${t.left === 0 || t.wait ? 'spent' : ''} ${t.locked ? 'locked' : ''}`} onClick={t.on}>
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
  const { p, now, openMini, openShells, toast } = useGame();
  // закрытая игра: замок и уровень, по нажатию — подсказка
  const gate = (id: string, t: Tile): Tile => {
    const u = unlockById.get(id);
    if (!u || p.level >= u.level) return t;
    return { icon: '🔒', name: `${t.name} · ${u.level} ур.`, left: null, locked: true, on: () => toast(`${u.emoji} ${u.name} — с ${u.level} уровня`) };
  };
  const ids: Record<string, string> = {
    Кости: 'dice', Армрестлинг: 'arm', Мишень: 'darts', Нарды: 'nardy', Домино: 'domino', Этюд: 'chess',
    'Чифир на скорость': 'speed', Конвейер: 'conveyor', Чётки: 'beads', Рыбалка: 'fish', 'Выжить в ШИЗО': 'shizo',
  };
  const all: Tile[] = [
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
        { icon: '🪂', name: 'Шмон с неба', left: p.games.raid, on: () => openMini('raid') },
        { icon: '🧱', name: 'Выжить в ШИЗО', left: p.tables.shizo ? null : p.games.shizo, on: () => openMini('shizo') },
  ];
  // закрытые — в конец, и только три ближайших: стена замков отпугивает
  const lvl = (t: Tile) => unlockById.get(ids[t.name])?.level ?? 0;
  const open = all.filter((t) => !ids[t.name] || p.level >= lvl(t));
  const shut = all.filter((t) => ids[t.name] && p.level < lvl(t)).sort((a, b) => lvl(a) - lvl(b));
  return (
    <>
      <Tiles tiles={[...open, ...shut.slice(0, 3).map((t) => gate(ids[t.name], t))]} />
      {shut.length > 3 && <div className="muted small center">Ещё {shut.length - 3} игр откроются с уровнем</div>}
    </>
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
        ...PLACES.filter((pl) => !pl.colony || pl.colony === p.colony).map((pl) => {
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

export { StoryCard } from './Story.tsx';
