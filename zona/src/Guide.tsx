import { chapterOf } from '../shared/story.ts';
import type { TrackKind } from '../shared/content.ts';
import { jumpSeg } from './Seg.tsx';
import { useGame, type Place, type Tab } from './game.tsx';

/** Куда вести за каждым видом шага сюжета. */
const WHERE: Partial<Record<TrackKind, { tab?: Tab; seg?: [string, string]; place?: Place; hint: string }>> = {
  job: { tab: 'work', seg: ['work', 'jobs'], hint: 'Работа → смена' },
  boss: { tab: 'fight', seg: ['fight', 'bosses'], hint: 'Бой → Боссы' },
  pvpWin: { tab: 'fight', seg: ['fight', 'pvp'], hint: 'Бой → Наезд' },
  butts: { tab: 'zone', hint: 'Зона → собирай бычки на земле' },
  furnish: { tab: 'home', seg: ['home', 'cell'], hint: 'Хата → Обустроить' },
  quest: { tab: 'work', seg: ['work', 'quests'], hint: 'Работа → Поручения' },
  minigame: { tab: 'zone', seg: ['zone', 'games'], hint: 'Зона → Игры' },
  visit: { tab: 'zone', seg: ['zone', 'places'], hint: 'Зона → Места → По хатам' },
  yard: { tab: 'fight', hint: 'Бой → прогуляйся по двору' },
  church: { place: 'church', hint: 'Зона → Церковь' },
  escape: { place: 'escape', hint: 'Зона → Побег' },
  worldHit: { tab: 'fight', seg: ['fight', 'riot'], hint: 'Бой → Бунт' },
  train: { tab: 'work', seg: ['work', 'gym'], hint: 'Работа → Качалка' },
  place: { tab: 'zone', seg: ['zone', 'places'], hint: 'Зона → Места' },
  spend: { tab: 'work', seg: ['work', 'jobs'], hint: 'трать энергию на смены и боссов' },
  event: { tab: 'fight', hint: 'жди «!» внизу или прогуляйся по двору' },
};

/** Подсказка новичку: что сделать дальше по сюжету, одной кнопкой — туда. До 8 уровня. */
export function GuideBar() {
  const { p, go, openPlace, openEvent } = useGame();
  if (p.level >= 8 || p.intro >= 0) return null;
  const ch = chapterOf(p.story.ch, p.mast);
  const step = ch?.steps[p.story.step];
  if (!ch || !step) return null;
  const ready = p.story.progress >= step.n;
  const w = WHERE[step.kind];
  const lead = () => {
    if (ready) {
      jumpSeg('home', 'story');
      return go('home');
    }
    if (step.kind === 'event' && p.event) return openEvent();
    if (!w) return;
    if (w.place) return openPlace(w.place);
    if (w.seg) jumpSeg(w.seg[0], w.seg[1]);
    if (w.tab) go(w.tab);
  };
  return (
    <button className={`guide ${ready ? 'ready' : ''}`} onClick={lead}>
      <span className="guide-icon">{ready ? '🎁' : '👉'}</span>
      <span className="grow">
        <b>{ready ? 'Шаг сюжета выполнен — забери награду' : step.text}</b>
        <small>
          {ready ? 'Хата → Сюжет' : w?.hint}
          {!ready && step.n > 1 ? ` · ${p.story.progress}/${step.n}` : ''}
        </small>
      </span>
      <i>▸</i>
    </button>
  );
}
