// Красные точки: где сейчас есть что забрать или сделать. Одна функция — для вкладок, разделов и плиток,
// чтобы путь до награды был виден на каждом шаге: вкладка → раздел → кнопка.
import type { PlayerView } from '../shared/types.ts';
import { chapterOf } from '../shared/story.ts';
import { PENPAL } from '../shared/penpal.ts';
import { TUNNEL } from '../shared/tunnel.ts';
import { FAMILY } from '../shared/family.ts';
import { FEATS, featProgress } from '../shared/feats.ts';

const H = 3600_000;

export function todo(p: PlayerView, now: number) {
  const story = p.story.progress >= (chapterOf(p.story.ch, p.mast)?.steps[p.story.step]?.n ?? Infinity);
  const daily = p.daily.tasks.some((t) => !t.claimed && t.progress >= t.target);
  const quest = !!p.quests.active && now >= p.quests.active.endsAt;
  const word = !p.word.done;
  const mail = p.inbox.some((m) => !m.read);
  const family = p.level >= FAMILY.minLevel && !p.family.done;
  const feat = FEATS.some((f) => !p.featsClaimed.includes(f.id) && featProgress(f, p) >= f.goal);
  const penpal = p.level >= PENPAL.minLevel && !!p.penpal && !p.penpal.ending && now >= p.penpal.nextAt;
  const ink = (p.ink?.queue.length ?? 0) > 0 || (!!p.inkOrder?.done && !p.inkOrder.rated);
  const tunnel = p.level >= TUNNEL.minLevel && !p.tunnel.done && (p.tunnel.depth >= TUNNEL.goal || now - p.tunnel.digAt >= TUNNEL.cooldownH * H);
  const riot = (p.riot.phase === 'vote' && p.riot.myVote === null) || p.riot.phase === 'fight' || p.riot.canClaim;
  const holiday = !!p.holiday?.dailyReady;
  const shmon = p.contra.shmon;
  const sections = {
    home: { story, look: !p.faceChosen, cell: p.reno.until > 0 && p.reno.until <= now },
    work: { games: word, daily, quests: quest, gym: p.statPoints > 0 },
    zone: { now: shmon || holiday, market: shmon },
    fight: { riot },
    me: { me: mail || family || penpal || ink || tunnel || feat },
  };
  return {
    sections,
    tabs: {
      home: now >= p.dailyReadyAt || story || !p.faceChosen || !p.bunk.done || (p.reno.until > 0 && p.reno.until <= now),
      zone: shmon || holiday || (p.riot.phase === 'vote' && p.riot.myVote === null),
      work: word || daily || quest || p.statPoints > 0,
      fight: riot,
      gear: sections.me.me,
    } as Record<string, boolean>,
  };
}
