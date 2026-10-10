import { useEffect, useState } from 'react';
import { STORY, chapterOf } from '../shared/story.ts';
import { ModalHead } from './Nav.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import type { RigAnim } from './art/rig/Rig.tsx';
import { lookOf, useGame } from './game.tsx';
import { play } from './sound.ts';

const DONE_LINES = [
  'Ты выжил. На зоне это уже карьера.',
  'Глава закрыта. Дело — нет, дело закрывает только прокурор.',
  'Все живы. Почти все. Кот Васька не в счёт.',
  'Ещё одна глава позади. Срок — впереди.',
  'Митрич сказал: «Растёшь». Митрич врёт редко.',
];

const BGS = ['#c9d6de', '#f2e6c8', '#ffd56a'];

/** Один кадр комикса: фон-плашка, двое на сцене, подпись снизу. */
function Panel({ i, hero, heroAnim, who, whoAnim, caption, title }: { i: number; hero: ReturnType<typeof lookOf>; heroAnim: RigAnim; who: string; whoAnim: RigAnim; caption: string; title?: string }) {
  const npc = useNpc(who);
  return (
    <div className="comic-panel" style={{ animationDelay: `${i * 0.9}s`, background: BGS[i % BGS.length], transform: `rotate(${[-1.2, 1, -0.6][i % 3]}deg)` }}>
      {title && <div className="comic-title">{title}</div>}
      <svg viewBox="0 0 300 150" width="100%">
        {i === 2 && (
          <g opacity={0.35}>
            {Array.from({ length: 14 }, (_, k) => (
              <path key={k} d={`M150,150 L${150 + Math.cos((k / 14) * Math.PI) * -300},${150 - Math.sin((k / 14) * Math.PI) * 300} L${150 + Math.cos(((k + 0.5) / 14) * Math.PI) * -300},${150 - Math.sin(((k + 0.5) / 14) * Math.PI) * 300} Z`} fill="#fff" />
            ))}
          </g>
        )}
        <Place x={i === 2 ? 150 : 100} y={146} scale={0.62}>
          <PoseG name="stand" look={hero} anim={heroAnim} startKey={i} />
        </Place>
        {npc && i < 2 && (
          <Place x={205} y={146} scale={0.6}>
            <ImageG url={npc.url} height={npc.height} mirror anim={whoAnim} />
          </Place>
        )}
      </svg>
      <div className="comic-cap">{caption}</div>
    </div>
  );
}

/** Комикс между главами: итог прошлой, завязка следующей. */
export function ChapterComic({ chapter, onClose }: { chapter: number; onClose(): void }) {
  const { p } = useGame();
  const done = chapterOf(chapter - 1, p.mast);
  const next = chapterOf(chapter, p.mast);
  const [line] = useState(() => DONE_LINES[Math.floor(Math.random() * DONE_LINES.length)]);
  useEffect(() => {
    const ts = [0, 900, 1800].map((d) => setTimeout(() => play('pop'), d + 150));
    return () => ts.forEach(clearTimeout);
  }, []);
  if (!done) return null;
  const hero = lookOf(p);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body comic-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title={`📖 Глава «${done.name}» пройдена`} />
        <div className="comic">
          <Panel i={0} hero={hero} heroAnim="cheer" who={done.who} whoAnim="nod" caption={line} />
          {next ? (
            <>
              <Panel i={1} hero={hero} heroAnim="think" who={next.who} whoAnim="talk" caption={next.intro} />
              <Panel i={2} hero={hero} heroAnim="proud" who={next.who} whoAnim="idle" caption={`Глава ${chapter + 1} из ${STORY.length}`} title={next.name} />
            </>
          ) : (
            <Panel i={1} hero={hero} heroAnim="dance" who={done.who} whoAnim="wave" caption="Сюжет пройден. Дальше — только УДО. Или новая ходка." />
          )}
        </div>
        <button className="btn btn-wide" onClick={onClose}>
          Дальше ▸
        </button>
      </div>
    </div>
  );
}
