import { useEffect, useState } from 'react';
import { ModalHead } from './Nav.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { lookOf, useGame } from './game.tsx';
import { play } from './sound.ts';

/** Ступени карьеры в ансамбле: считаются по репетициям и концертам. */
const RANKS = [
  { at: 0, name: 'Ложечник', emoji: '🥄' },
  { at: 5, name: 'Бэк-вокал', emoji: '🎶' },
  { at: 15, name: 'Гитарист «трёх аккордов»', emoji: '🎸' },
  { at: 30, name: 'Солист', emoji: '🎤' },
  { at: 60, name: 'Звезда зоны', emoji: '🌟' },
];
const SONGS = ['«Владимирский централ» (48-я попытка)', '«Таганка» в ритме диско', '«Голуби летят над нашей зоной»', '«Кольщик, наколи мне купола» — акустика', '«Мурка» с хором охраны', '«Гоп-стоп» — версия для кума'];

export function ensemblePoints(feats: Record<string, number>) {
  return (feats['place:club.rehearse'] ?? 0) + 3 * (feats['place:club.concert'] ?? 0);
}

/** Карточка карьеры в клубе. */
export function EnsembleCard() {
  const { p } = useGame();
  const pts = ensemblePoints(p.feats);
  const i = [...RANKS].reverse().findIndex((r) => pts >= r.at);
  const cur = RANKS[RANKS.length - 1 - i];
  const next = RANKS[RANKS.length - i];
  return (
    <div className="reno-card">
      <div className="reno-head">
        <b>
          {cur.emoji} Ансамбль «Решётка» · {cur.name}
        </b>
        <span className="muted small">{pts} оч.</span>
      </div>
      {next ? (
        <>
          <div className="bar reno-bar">
            <div style={{ width: `${Math.min(100, ((pts - cur.at) / (next.at - cur.at)) * 100)}%` }} />
          </div>
          <small className="muted">
            До «{next.name}» — {next.at - pts} оч. Репетиция — 1, концерт — 3.
          </small>
        </>
      ) : (
        <small className="muted">Выше только УДО. Автографы раздаёшь даже куму.</small>
      )}
    </div>
  );
}

/** Концерт: герой поёт в луче прожектора, зал хлопает и свистит. */
export function ConcertModal({ onClose }: { onClose(): void }) {
  const { p } = useGame();
  const ded = useNpc('sheet/cast/ushanka');
  const kum = useNpc('sheet/cast/officer');
  const amba = useNpc('sheet/rival/1');
  const [song] = useState(() => SONGS[Math.floor(Math.random() * SONGS.length)]);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => {
      setEnd(true);
      play('applause');
    }, 3600);
    return () => clearTimeout(a);
  }, []);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="🎤 Концерт самодеятельности" />
        <svg viewBox="0 0 300 200" className="pillow-field">
          <rect width={300} height={200} fill="#2a1a2a" />
          <path d="M0,0 Q40,60 20,140 L0,140 Z M300,0 Q260,60 280,140 L300,140 Z" fill="#8a1a2a" stroke="#1a1410" strokeWidth={2} />
          <rect y={120} width={300} height={22} fill="#7a4a2a" stroke="#1a1410" strokeWidth={2} />
          <path d="M150,-10 L110,124 L190,124 Z" fill="#fff6c8" opacity={0.25} />
          <Place x={150} y={124} scale={0.55}>
            <PoseG name="stand" look={lookOf(p)} anim={end ? 'cheer' : 'talk'} startKey={end ? 1 : 0} />
          </Place>
          {/* микрофон */}
          <path d="M168,124 V82" stroke="#1a1410" strokeWidth={2} />
          <circle cx={168} cy={80} r={4} fill="#3a3a44" stroke="#1a1410" strokeWidth={1.2} />
          {!end && ['♪', '♫', '♪'].map((n, k) => (
            <text key={k} className="court-zzz" x={176 + k * 14} y={70 - k * 10} fontSize={14} fill="#ffd24a" style={{ animationDelay: `${k * 0.3}s` }}>
              {n}
            </text>
          ))}
          {/* зал */}
          <rect y={142} width={300} height={58} fill="#1a1012" />
          {[ded, kum, amba].map((n, k) =>
            n ? (
              <Place key={k} x={60 + k * 90} y={232} scale={0.45}>
                <ImageG url={n.url} height={n.height} anim={end ? (k === 1 ? 'nod' : 'cheer') : 'idle'} />
              </Place>
            ) : null,
          )}
        </svg>
        <div className={`verdict ${end ? 'win' : ''}`}>{end ? 'Овация! Кум хлопает. Значит, выйдешь не скоро — нужен в ансамбле.' : `Исполняется: ${song}`}</div>
        <button className="btn btn-wide" onClick={onClose}>
          {end ? 'Поклониться' : 'Пропустить'}
        </button>
      </div>
    </div>
  );
}
