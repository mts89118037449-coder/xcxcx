import { useState } from 'react';
import { needFail } from '../shared/events.ts';
import { PLACES, placeById, type PlaceId } from '../shared/places.ts';
import { mastById } from '../shared/term.ts';
import { gotLine } from './EventsLite.tsx';
import { LocationScene } from './art/Locations.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { fmt, lookOf, timeLeft, useAnim, useGame } from './game.tsx';

interface Got {
  text: string;
  money: number;
  butts: number;
  gold: number;
  xp: number;
  authority: number;
  energy: number;
  hp: number;
  item: string | null;
  term: number;
}

/** Место зоны: сцена с хозяином и плитки занятий с откатами. */
export function PlaceScreen({ id, onBack }: { id: PlaceId; onBack(): void }) {
  const { p, now, act, busy } = useGame();
  const pl = placeById.get(id)!;
  const host = useNpc(pl.who);
  const [anim, animKey, play] = useAnim();
  const [res, setRes] = useState<Got | null>(null);
  const ration = 30 + p.level * 15;

  const run = async (actId: string) => {
    const r = await act<Got>('place', { place: id, act: actId });
    if (!r) return;
    setRes(r);
    play(r.hp < 0 ? 'got-hit' : 'act-cheer');
  };

  return (
    <>
      <div className="scene-wrap">
        <LocationScene place={id}>
          <Place x={118} y={266} scale={0.92} key={animKey} className={`pose ${anim}`}>
            <PoseG name="stand" look={lookOf(p)} />
          </Place>
          {host && (
            <Place x={264} y={264} scale={0.9}>
              <ImageG url={host.url} height={host.height} mirror className="char-breathe" />
            </Place>
          )}
        </LocationScene>
        <div className="ev-bubble place-bubble" key={res ? res.text : 'greet'}>
          <b>{pl.host}</b>
          {res ? res.text : pl.greet}
          {res && <small className="place-got">{gotLine(res) || 'без последствий'}</small>}
        </div>
        <div className="scene-tag">
          {pl.icon} {pl.name}
        </div>
        <button className="place-back" onClick={onBack}>
          ← На зону
        </button>
      </div>
      <div className="place-acts">
        {pl.activities.map((a) => {
          const readyAt = p.placeCd[`${id}.${a.id}`] ?? 0;
          const wait = readyAt > now;
          const why = needFail(a.need, p);
          const c = a.cost ?? {};
          const money = Math.round((c.money ?? 0) * ration);
          const poor = p.money < money || p.butts < (c.butts ?? 0) || p.gold < (c.gold ?? 0) || p.energy < (c.energy ?? 0);
          const price = [money && `${fmt(money)} ₽`, c.butts && `${c.butts} 🚬`, c.gold && `${c.gold} 🪙`, c.energy && `${c.energy} ⚡`].filter(Boolean).join(' · ');
          const lock = why ? (a.need?.mast ? a.need.mast.map((m) => mastById.get(m)?.emoji).join('') + ' ' + why : why) : '';
          return (
            <button key={a.id} className={`place-act ${wait || why ? 'spent' : ''}`} disabled={busy || wait || !!why || poor} onClick={() => run(a.id)}>
              <span className="place-ico">{a.icon}</span>
              <b>{a.label}</b>
              <small>{why ? `🔒 ${lock}` : wait ? `⏳ ${timeLeft(readyAt - now)}` : a.hint}</small>
              {price && !wait && !why && <i>{price}</i>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Плитки мест для вкладки «Места». */
export const PLACE_TILES = PLACES;
