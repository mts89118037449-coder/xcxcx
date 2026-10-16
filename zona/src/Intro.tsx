import { useState } from 'react';
import { INTRO } from '../shared/term.ts';
import { EscapeScene } from './art/PlaceScenes.tsx';
import { CellScene, Place, YardScene } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { lookOf, useGame } from './game.tsx';

/** Этапирование: первые минуты в игре — несколько сцен с выбором вместо инструкции. */
export function IntroOverlay({ onDone }: { onDone(): void }) {
  const { p, act, busy } = useGame();
  // свой номер шага: после ответа сервер уже на следующем, а мы ещё показываем реплику
  const [idx, setIdx] = useState(Math.max(0, p.intro));
  const step = INTRO[idx];
  const npc = useNpc(step?.who ?? '');
  const [reply, setReply] = useState<{ text: string; gains: string; done: boolean } | null>(null);
  if (!step) return null;

  const pick = async (i: number) => {
    const r = await act<{ reply: string; money: number; authority: number; butts: number; xp: number; done: boolean }>('intro', { choice: i });
    if (!r) return;
    const gains = [r.money && `${r.money > 0 ? '+' : ''}${r.money} ₽`, r.authority && `${r.authority > 0 ? '+' : ''}${r.authority} 🎖️`, r.butts && `${r.butts > 0 ? '+' : ''}${r.butts} 🚬`, r.xp && `+${r.xp} ⭐`].filter(Boolean).join(' · ');
    setReply({ text: r.reply, gains, done: r.done });
  };

  const hero = (
    <Place x={112} y={268} scale={0.92}>
      <PoseG name="stand" anim={step.scene === 'yard' ? 'guard' : step.scene === 'road' ? 'cold' : 'crossed'} look={lookOf(p)} />
    </Place>
  );
  const who = npc && (
    <Place x={262} y={268} scale={0.92}>
      <ImageG url={npc.url} mirror />
    </Place>
  );
  const scene =
    step.scene === 'road' ? (
      <EscapeScene stage="road" alarm={false}>
        {hero}
        {who}
      </EscapeScene>
    ) : step.scene === 'cell' ? (
      <CellScene furniture={[]}>
        {hero}
        {who}
      </CellScene>
    ) : (
      <YardScene tower={step.scene === 'yard'}>
        {hero}
        {who}
      </YardScene>
    );

  return (
    <div className="modal intro-modal">
      <div className="modal-body ev-body intro-body">
        <div className="intro-steps">
          {INTRO.map((_, i) => (
            <i key={i} className={i < idx || (i === idx && reply) ? 'done' : i === idx ? 'now' : ''} />
          ))}
        </div>
        <div className="arena ev-arena">
          {scene}
          <div className="ev-bubble" key={reply ? 'r' : `q${idx}`}>
            <b>{step.name}</b>
            {reply ? reply.text : step.text}
          </div>
        </div>
        {reply ? (
          <>
            {reply.gains && <div className="intro-gains">{reply.gains}</div>}
            <button
              className="btn btn-wide"
              onClick={() => {
                if (reply.done) return onDone();
                setReply(null);
                setIdx(idx + 1);
              }}
            >
              {reply.done ? 'В хату ▸' : 'Дальше ▸'}
            </button>
          </>
        ) : (
          <div className="ev-opts">
            {step.options.map((o, i) => (
              <button key={i} className="btn btn-wide btn-dark ev-opt" disabled={busy} onClick={() => pick(i)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
