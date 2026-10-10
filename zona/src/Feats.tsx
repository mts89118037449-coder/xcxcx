import { useState } from 'react';
import { FEATS, featById, featProgress } from '../shared/feats.ts';
import { ShareButton } from './Share.tsx';
import { ModalHead } from './Nav.tsx';
import { useGame } from './game.tsx';

/** Абсурдные ачивки: карточка в профиле и список. */
export function FeatsCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const ready = FEATS.filter((f) => !p.featsClaimed.includes(f.id) && featProgress(f, p) >= f.goal).length;
  return (
    <>
      <button className={`pen-card ${ready ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">🏅</span>
        <span className="grow">
          <b>Ачивки, которыми не хвастаются</b>
          <small>{ready ? `Можно забрать: ${ready}` : `Получено ${p.featsClaimed.length} из ${FEATS.length}`}</small>
        </span>
        <i>▸</i>
      </button>
      <FeatBadges ids={p.featsClaimed} />
      {open && <FeatsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FeatsModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="🏅 Ачивки" />
        <div className="feats">
          {FEATS.map((f) => {
            const have = featProgress(f, p);
            const done = have >= f.goal;
            const got = p.featsClaimed.includes(f.id);
            return (
              <div key={f.id} className={`feat ${got ? 'got' : done ? 'ready' : ''}`}>
                <span className="feat-ico">{f.emoji}</span>
                <span className="grow">
                  <b>{f.name}</b>
                  <small>{f.desc}</small>
                  {!got && (
                    <span className="feat-bar">
                      <i style={{ width: `${(100 * have) / f.goal}%` }} />
                      <em>
                        {have}/{f.goal}
                      </em>
                    </span>
                  )}
                </span>
                {got ? (
                  <ShareButton
                    className="btn btn-s btn-dark"
                    card={{ emoji: f.emoji, title: f.name, sub: f.desc, tone: 'gold' }}
                    caption={`Ачивка «${f.name}» на зоне. ${f.desc}. А у тебя слабо?`}
                  />
                ) : (
                  <button className="btn btn-s btn-gold" disabled={busy || !done} onClick={() => act('claimFeat', { id: f.id })}>
                    {f.gold} 🪙
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Значки полученных ачивок: в профиле и в гостях. */
export function FeatBadges({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="feat-badges">
      {ids.map((id) => {
        const f = featById.get(id);
        return f ? (
          <span key={id} title={`${f.name}: ${f.desc}`}>
            {f.emoji}
          </span>
        ) : null;
      })}
    </div>
  );
}
