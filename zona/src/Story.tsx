import { chapterOf } from '../shared/story.ts';
import { NpcPortrait, useNpc } from './art/sprites.tsx';
import { useGame } from './game.tsx';

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
