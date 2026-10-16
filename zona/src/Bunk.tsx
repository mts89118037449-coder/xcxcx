import { useEffect, useState } from 'react';
import { babble } from './sound.ts';
import { BUNK_WHO, bunkOfDay, type BunkReward } from '../shared/bunk.ts';
import { ModalHead } from './Nav.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import type { RigAnim } from './art/rig/Rig.tsx';
import { lookOf, useGame } from './game.tsx';

/** Награда одной строкой: значки вместо слов. */
export function bunkRewardLine(r: BunkReward) {
  return [r.butts && `+${r.butts} 🚬`, r.xp && `+${r.xp} опыта`, r.authority && `+${r.authority} ⭐`, r.energy && `+${r.energy} ⚡`, r.hp && `+${Math.round(r.hp * 100)}% ❤️`].filter(Boolean).join(' · ');
}

/** Разговор у шконки: раз в сутки сокамерник подсаживается с вопросом. */
export function BunkModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const talk = bunkOfDay(p.bunk.day);
  const who = BUNK_WHO[talk.who];
  const npc = useNpc(who.npc);
  const [said, setSaid] = useState<number | null>(p.bunk.done ? p.bunk.pick : null);
  const [res, setRes] = useState<{ reply: string; reward: BunkReward } | null>(null);
  const answer = async (i: number) => {
    setSaid(i);
    const r = await act<{ reply: string; reward: BunkReward }>('bunkTalk', { choice: i });
    if (r) setRes(r);
    else setSaid(null);
  };
  // кто говорит: сначала он, потом герой, потом снова он
  const npcAnim: RigAnim = res ? 'nod' : said !== null ? 'idle' : 'talk';
  const heroAnim: RigAnim = said !== null && !res ? 'talk' : res ? 'idle' : 'idle';
  const bubble = res ? res.reply : said !== null ? talk.options[said].text : talk.line;
  const mine = said !== null && !res;
  useEffect(() => {
    babble(bubble, mine ? p.name : who.name);
  }, [bubble]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="💬 У шконки" />
        <div className="bunk-scene">
          <svg viewBox="0 0 360 230" width="100%">
            <rect width={360} height={230} fill="#3b3a35" />
            <rect y={196} width={360} height={34} fill="#5a4030" />
            {/* шконка */}
            <rect x={20} y={150} width={320} height={10} rx={2} fill="#6c7078" stroke="#222" strokeWidth={2} />
            <rect x={24} y={138} width={312} height={14} rx={5} fill="#3e5a7a" stroke="#222" strokeWidth={2} />
            {[30, 330].map((x) => (
              <rect key={x} x={x - 3} y={150} width={6} height={50} fill="#4a4e56" stroke="#222" strokeWidth={1.5} />
            ))}
            <Place x={110} y={214} scale={0.86}>
              <PoseG name="sit" anim={heroAnim === 'talk' ? 'talk' : undefined} look={lookOf(p)} startKey={said ?? -1} />
            </Place>
            {npc && (
              <Place x={250} y={214} scale={0.86}>
                <ImageG url={npc.url} height={npc.height} mirror anim={npcAnim === 'idle' ? undefined : npcAnim} />
              </Place>
            )}
          </svg>
          <div className={`ev-bubble bunk-bubble ${mine ? 'me' : ''}`} key={bubble}>
            <b>{mine ? p.name : who.name}</b>
            {bubble}
            {res && <small className="place-got">{bunkRewardLine(res.reward)}</small>}
          </div>
        </div>
        {!p.bunk.done && said === null && (
          <div className="ev-opts">
            {talk.options.map((o, i) => (
              <button key={i} className="ev-opt" disabled={busy} onClick={() => answer(i)}>
                {o.text}
              </button>
            ))}
          </div>
        )}
        {(res || (p.bunk.done && !busy && said !== null && !res)) && (
          <>
            {!res && <p className="muted small center">Сегодня уже поговорили. Завтра {who.name} подсядет снова.</p>}
            <button className="btn btn-wide" onClick={onClose}>
              Ясно
            </button>
          </>
        )}
      </div>
    </div>
  );
}
