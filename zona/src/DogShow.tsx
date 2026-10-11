import { useEffect, useState } from 'react';
import { DOG_SHOW, DOG_TRICKS, dogScore } from '../shared/pets.ts';
import { ModalHead } from './Nav.tsx';
import { Dog } from './art/Critters.tsx';
import { useClock } from './art/rig/Toon.tsx';
import { api } from './api.ts';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

type View = { rows: { id: number; name: string; dog: string; score: number }[]; prize: number; lastPlace: number };

/** Команды пса строкой значков: выученные — ярко. */
export function DogTricks({ level }: { level: number }) {
  return (
    <span className="pet-wear">
      {DOG_TRICKS.map((t) => (
        <button key={t.id} disabled className={level >= t.level ? 'active' : ''} title={t.name}>
          {t.emoji}
          <small>{level >= t.level ? t.name : `ур. ${t.level}`}</small>
        </button>
      ))}
    </span>
  );
}

/** Выставка собак зоны: выставить пса, посмотреть рейтинг недели, забрать приз. */
export function DogShowModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [v, setV] = useState<View | null>(null);
  const t = useClock(true);
  useEffect(() => {
    api.action<View>('dogTop').then((r) => setV(r.result)).catch(() => null);
  }, []);
  const enter = async () => {
    const r = await act<View>('dogShow');
    if (r) {
      setV(r);
      play('applause');
    }
  };
  const lvl = p.pet?.kind === 'dog' ? p.pet.level : 0;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="🐕 Выставка собак зоны" />
        <svg viewBox="0 0 300 130" className="pillow-field">
          <rect width={300} height={130} fill="#c9d6de" />
          <rect y={96} width={300} height={34} fill="#7a9a5a" stroke="#1a1410" strokeWidth={2} />
          <rect x={120} y={70} width={60} height={28} fill="#ffd24a" stroke="#1a1410" strokeWidth={2} />
          <text x={150} y={90} fontSize={14} fontWeight={900} textAnchor="middle" fill="#1a1410">
            1
          </text>
          <g transform="translate(150 72)">
            <Dog t={t} sit={Math.sin(t / 900) > 0} />
          </g>
          <text x={150} y={22} fontSize={12} fontWeight={900} textAnchor="middle" fill="#1a1410">
            {p.pet?.kind === 'dog' ? `${p.pet.name}: ${dogScore(lvl)} очков` : 'Заведи пса — и на подиум'}
          </text>
        </svg>
        {v && v.prize > 0 && (
          <button className="btn btn-wide btn-gold" disabled={busy} onClick={async () => (await act('dogClaim')) && setV({ ...v, prize: 0 })}>
            🏆 {v.lastPlace}-е место прошлой недели · {v.prize} 🪙
          </button>
        )}
        <button className="btn btn-wide" disabled={busy || p.pet?.kind !== 'dog'} onClick={enter} style={{ marginTop: 6 }}>
          Выставить пса (обновить очки)
        </button>
        {v && v.rows.length > 0 && (
          <div className="raid-top">
            <b>🏆 Рейтинг недели · призы {DOG_SHOW.prizes.join(' / ')} 🪙</b>
            {v.rows.map((r, i) => (
              <div key={r.id} className={r.id === p.id ? 'me' : ''}>
                <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                <span className="grow">
                  {r.dog} <small className="muted">({r.name})</small>
                </span>
                <span>{r.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
