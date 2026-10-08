import { useState } from 'react';
import { ALBUMS, WALL_MAX, albumProgress, type AlbumId } from '../shared/album.ts';
import { bossById, tattooById } from '../shared/content.ts';
import { cosmeticById } from '../shared/season.ts';
import { STORY } from '../shared/story.ts';
import { placeById } from '../shared/places.ts';
import { useGame } from './game.tsx';

/** Картинка и подпись предмета коллекции. */
function cell(album: AlbumId, id: string): { icon: string; name: string } {
  if (album === 'bosses') return { icon: bossById.get(id)?.emoji ?? '?', name: bossById.get(id)?.name ?? id };
  if (album === 'tattoos') return { icon: tattooById.get(id)?.emoji ?? '?', name: tattooById.get(id)?.name ?? id };
  if (album === 'story') {
    const i = STORY.findIndex((c) => c.id === id);
    return { icon: '📷', name: `${i + 1}. ${STORY[i]?.name ?? id}` };
  }
  return { icon: placeById.get(id as never)?.icon ?? '?', name: placeById.get(id as never)?.name ?? id };
}

/** Альбом: четыре коллекции, награда за полную, трофеи — на стену хаты. */
export function AlbumModal({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [tab, setTab] = useState<AlbumId>('bosses');
  const prog = albumProgress(p);
  const a = ALBUMS.find((x) => x.id === tab)!;
  const pr = prog[tab];
  const done = pr.have.length >= pr.total.length;
  const claimed = p.albums.includes(tab);
  const claim = async () => {
    const r = await act<{ gold: number; cosmetic: string }>('albumClaim', { id: tab });
    if (r) toast(`+${r.gold} 🪙 · ${cosmeticById.get(r.cosmetic)?.name ?? ''}`);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body album" onClick={(e) => e.stopPropagation()}>
        <h2>📒 Альбом</h2>
        <div className="album-tabs">
          {ALBUMS.map((x) => (
            <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
              <span>{x.emoji}</span>
              {x.name}
              <small>
                {prog[x.id].have.length}/{prog[x.id].total.length}
              </small>
            </button>
          ))}
        </div>
        <div className="muted small">
          {a.desc}. Награда: {a.gold} 🪙 и {cosmeticById.get(a.cosmetic)?.name}.
          {tab === 'bosses' && ` Нажми на трофей — повесить на стену хаты (до ${WALL_MAX}).`}
        </div>
        <div className="album-grid">
          {pr.total.map((id) => {
            const have = pr.have.includes(id);
            const c = cell(tab, id);
            const onWall = tab === 'bosses' && p.wall.includes(id);
            return (
              <button key={id} className={`album-cell ${have ? 'have' : ''} ${onWall ? 'wall' : ''}`} disabled={tab !== 'bosses' || !have || busy} onClick={() => act('wall', { id })}>
                <span>{have ? c.icon : '❔'}</span>
                <small>{have ? c.name : '???'}</small>
                {onWall && <i>🖼️</i>}
              </button>
            );
          })}
        </div>
        {claimed ? (
          <div className="verdict win">✔ Коллекция собрана, награда получена</div>
        ) : (
          <button className="btn btn-wide btn-gold" disabled={!done || busy} onClick={claim}>
            {done ? `🎁 Забрать: ${a.gold} 🪙 + ${cosmeticById.get(a.cosmetic)?.name}` : `Собрано ${pr.have.length} из ${pr.total.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
