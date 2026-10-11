import { useEffect, useState } from 'react';
import type { Look } from '../shared/types.ts';
import { ModalHead } from './Nav.tsx';
import { ChurchScene, Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { faceOf } from '../shared/content.ts';
import { lookOf, useGame } from './game.tsx';
import { babble, play } from './sound.ts';

/** Невеста: белое платье (врачебный халат — что нашли в санчасти). */
const BRIDE: Look = { equipped: { body: 'npc_whitecoat', feet: 'feet_lacquer' }, tattoos: [], str: 5, face: faceOf({ hair: 6, beard: 0, jaw: 1, brow: 0 }), build: 0, skin: 1 };

const STEPS = [
  'Батюшка: «Венчается раб Божий… а за что сидит — не уточняем»',
  'Свидетель со стороны жениха — кум. Он всё видит. Всегда',
  'Торт из баланды: три слоя, рецепт засекречен, Жора плачет',
  'ГОРЬКО! Хата кричит так, что на вышке проснулся вертухай',
];

/** Свадьба с заочницей: венчание в зоновской церквушке, гости-сокамерники, рис и «Горько!». */
export function WeddingModal({ name, onClose }: { name: string; onClose(): void }) {
  const { p } = useGame();
  const priest = useNpc('sheet/cast/priest');
  const cook = useNpc('sheet/cast/cook');
  const ded = useNpc('sheet/cast/ushanka');
  const kum = useNpc('sheet/cast/officer');
  const [i, setI] = useState(0);
  useEffect(() => {
    babble(STEPS[i], i === 1 ? 'кум' : 'Батюшка');
    if (i === 3) play('applause');
    if (i >= STEPS.length - 1) return;
    const t = setTimeout(() => setI(i + 1), 3200);
    return () => clearTimeout(t);
  }, [i]);
  const gorko = i === 3;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title={`💒 Свадьба: ${p.name} + ${name}`} />
        <div className="scene-wrap wedding">
          <ChurchScene candles={9}>
            {priest && (
              <Place x={180} y={236} scale={0.62}>
                <ImageG url={priest.url} height={priest.height} anim={i === 0 ? 'talk' : 'nod'} />
              </Place>
            )}
            {kum && (
              <Place x={44} y={258} scale={0.6}>
                <ImageG url={kum.url} height={kum.height} anim={i === 1 ? 'talk' : 'crossed'} />
              </Place>
            )}
            {ded && (
              <Place x={318} y={258} scale={0.6}>
                <ImageG url={ded.url} height={ded.height} mirror anim={gorko ? 'cheer' : 'idle'} />
              </Place>
            )}
            {cook && (
              <Place x={270} y={262} scale={0.6}>
                <ImageG url={cook.url} height={cook.height} mirror anim={i === 2 ? 'sad' : gorko ? 'dance' : 'idle'} />
              </Place>
            )}
            <Place x={128} y={266} scale={0.8}>
              <PoseG name="stand" look={lookOf(p)} anim={gorko ? 'cheer' : 'proud'} startKey={i} />
            </Place>
            <Place x={222} y={266} scale={0.76}>
              <PoseG name="stand" look={BRIDE} anim={gorko ? 'cheer' : 'wave'} mirror startKey={i} />
            </Place>
            {/* торт из баланды */}
            {i >= 2 && (
              <g transform="translate(176 250)" className="comic-panel" style={{ opacity: 1 }}>
                <rect x={-16} y={-6} width={32} height={10} fill="#c9b07a" stroke="#1a1410" strokeWidth={1.6} />
                <rect x={-12} y={-14} width={24} height={9} fill="#b8a06a" stroke="#1a1410" strokeWidth={1.6} />
                <rect x={-8} y={-21} width={16} height={8} fill="#a8905a" stroke="#1a1410" strokeWidth={1.6} />
                <path d="M0,-21 V-27" stroke="#ffd24a" strokeWidth={2} />
              </g>
            )}
            {gorko &&
              Array.from({ length: 24 }, (_, k) => (
                <rect key={k} className="rice" x={40 + ((k * 53) % 280)} y={-10} width={2.4} height={4} fill="#fff" style={{ animationDelay: `${(k % 8) * 0.15}s` }} />
              ))}
            {gorko && (
              <text x={180} y={60} fontSize={30} fontWeight={900} textAnchor="middle" fill="#ffd24a" stroke="#1a1410" strokeWidth={1.4} className="court-zzz">
                ГОРЬКО!
              </text>
            )}
          </ChurchScene>
          <div className="ev-bubble place-bubble" key={i}>
            {STEPS[i]}
          </div>
        </div>
        <button className="btn btn-wide" onClick={onClose}>
          {gorko ? 'Совет да любовь ❤️' : 'Пропустить'}
        </button>
      </div>
    </div>
  );
}
