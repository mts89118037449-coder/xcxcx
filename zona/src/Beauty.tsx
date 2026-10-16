import { useEffect, useState } from 'react';
import { BEAUTY } from '../shared/beauty.ts';
import type { Look } from '../shared/types.ts';
import { ModalHead } from './Nav.tsx';
import { NowChip } from './Chip.tsx';
import { api } from './api.ts';
import { PoseG } from './art/sprites.tsx';
import type { RigAnim } from './art/rig/Rig.tsx';
import { FACES } from './Photo.tsx';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

type Entry = { id: number; name: string; look: Look; anim: string; fx: string; bg: string; votes: number; voted: boolean };
type View = { entries: Entry[]; mine: boolean; prize: number; lastPlace: number };

/** «Мисс и Мистер Зона»: плашка на карте и галерея с голосованием. */
export function BeautyChip() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NowChip icon="👑" label="Конкурс" sub="Мистер Зона" onClick={() => setOpen(true)} />
      {open && <BeautyModal onClose={() => setOpen(false)} />}
    </>
  );
}

function BeautyModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    api.action<View>('beautyTop').then((r) => setV(r.result)).catch(() => null);
  }, []);
  const vote = async (id: number) => {
    const r = await act<View>('beautyVote', { id });
    if (r) {
      setV(r);
      play('pop');
    }
  };
  const claim = async () => {
    if (await act('beautyClaim')) setV(v && { ...v, prize: 0 });
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="👑 Мистер Зона" />
        <p className="muted small">
          Выставь фото из фото-режима (📸 в хате) и голосуй за чужие: {BEAUTY.votesPerDay} голосов в день. Тройке лучших недели — {BEAUTY.prizes.join(' / ')} 🪙.
        </p>
        {v && v.prize > 0 && (
          <button className="btn btn-wide btn-gold" disabled={busy} onClick={claim}>
            🏆 {v.lastPlace}-е место прошлой недели · забрать {v.prize} 🪙
          </button>
        )}
        {v && !v.entries.length && <p className="muted small center">Пока никто не решился. Будь первым красавцем зоны.</p>}
        <div className="beauty-grid">
          {v?.entries.map((e, i) => (
            <div key={e.id} className={`beauty-card ${e.id === p.id ? 'me' : ''}`}>
              <div className={`photo-frame bg-${e.bg}`}>
                {i < 3 && <span className="beauty-place">{['🥇', '🥈', '🥉'][i]}</span>}
                <svg viewBox="-30 -6 180 222" className="photo-svg">
                  <PoseG name="stand" look={e.look} anim={e.anim as RigAnim} fx={FACES.find((f) => f.id === e.fx)?.fx} />
                </svg>
              </div>
              <b>{e.name}</b>
              <button className={`btn btn-s ${e.voted || e.id === p.id ? 'btn-dark' : 'btn-red'}`} disabled={busy || e.voted || e.id === p.id} onClick={() => vote(e.id)}>
                ❤️ {e.votes}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
