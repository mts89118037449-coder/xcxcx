import { eventById, needFail } from '../shared/events.ts';
import { tattooById } from '../shared/content.ts';
import { mastById } from '../shared/term.ts';
import { useState } from 'react';
import { itemLabel } from './Perks.tsx';
import { CellScene, Place, YardScene } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc, NpcPortrait } from './art/sprites.tsx';
import { fmt, lookOf, useGame } from './game.tsx';

interface Got {
  text: string;
  who: string;
  name: string;
  money: number;
  butts: number;
  gold: number;
  xp: number;
  authority: number;
  energy: number;
  hp: number;
  item: string | null;
  next?: boolean;
  debt?: number;
  rep?: Partial<Record<string, number>>;
}

const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);

/** Что изменилось после случая — одной строкой. */
export function gotLine(g: Omit<Got, 'text' | 'who' | 'name'> & { term?: number; debt?: number; rep?: Partial<Record<string, number>> }): string {
  const parts: string[] = [];
  if (g.debt) parts.push(`📒 долг +${fmt(g.debt)} ₽`);
  for (const [id, n] of Object.entries(g.rep ?? {})) if (n) parts.push(`${n > 0 ? '+' : ''}${n} ${id === 'brat' ? '🃏' : id === 'work' ? '⚒️' : '📋'}`);
  if (g.term) parts.push(`−${Math.round(g.term * 10) / 10} дн. срока`);
  if (g.money) parts.push(`${sign(g.money)} ₽`);
  if (g.butts) parts.push(`${sign(g.butts)} 🚬`);
  if (g.gold) parts.push(`${sign(g.gold)} 🪙`);
  if (g.xp) parts.push(`+${g.xp} опыта`);
  if (g.authority) parts.push(`${sign(g.authority)} 🎖️`);
  if (g.energy) parts.push(`${sign(g.energy)} ⚡`);
  if (g.hp) parts.push(`${sign(g.hp)} ❤️`);
  if (g.item) parts.push(itemLabel(g.item));
  return parts.join(' · ');
}

/** Открыть случай (текущий или только что выпавший во дворе) — сценой. */
export function useEvent() {
  const { openEvent } = useGame();
  return (id?: string) => openEvent(id);
}

/** Случай сценой: персонаж в хате или во дворе, реплика облачком, выбор крупными кнопками, исход — реакцией и наградами. */
export function EventStage({ id, onClose }: { id: string; onClose(): void }) {
  const { p, act, busy } = useGame();
  const ev = eventById.get(id);
  const npc = useNpc(ev?.who ?? '');
  const [res, setRes] = useState<Got | null>(null);
  const [anim, setAnim] = useState('');
  if (!ev) return null;
  const ration = 30 + p.level * 15;
  const score = (r: Got) => r.money + r.butts * 20 + r.gold * 50 + r.xp + r.authority * 10 + r.energy + r.hp / 5 + (r.item ? 50 : 0);
  const isBad = (r: Got) => r.hp < 0 || r.money < 0 || r.butts < 0 || r.authority < 0 || (r.debt ?? 0) > 0;
  const bad = !!res && isBad(res);
  const good = !!res && !bad && score(res) > 0;

  const pick = async (i: number) => {
    const r = await act<Got>('event', { choice: i });
    if (!r) return;
    setRes(r);
    setAnim(isBad(r) ? 'got-hit' : score(r) > 0 ? 'act-cheer' : '');
  };
  const hero = (
    <Place x={112} y={268} scale={0.92} key={anim} className={`pose ${anim}`}>
      <PoseG name="stand" look={lookOf(p)} />
    </Place>
  );
  const who = npc && (
    <Place x={262} y={268} scale={0.92}>
      <ImageG url={npc.url} height={npc.height} mirror className="char-breathe" />
    </Place>
  );
  const scene =
    ev.where === 'yard' ? (
      <YardScene>
        {hero}
        {who}
      </YardScene>
    ) : (
      <CellScene furniture={p.cell} interior={p.interior}>
        {hero}
        {who}
      </CellScene>
    );

  return (
    <div className="modal ev-modal" onClick={() => res && onClose()}>
      <div className="modal-body ev-body" onClick={(e) => e.stopPropagation()}>
        <div className="arena ev-arena">
          {scene}
          <div className={`ev-bubble ${res ? (bad ? 'bad' : good ? 'good' : '') : ''}`} key={res ? 'r' : 'q'}>
            <b>{ev.name}</b>
            {res ? res.text : ev.text}
          </div>
          {res && (bad || good) && <div className={`ev-stamp ${bad ? 'bad' : 'good'}`}>{bad ? '✖' : '✔'}</div>}
        </div>
        {!res ? (
          <div className="ev-opts">
            {ev.options.map((o, i) => {
              const cost = o.cost ?? {};
              const money = Math.round((cost.money ?? 0) * ration);
              const label = o.label.replace(/\s*\([^)]*\)\s*$/, '');
              const tag = money ? `${fmt(money)} ₽` : cost.butts ? `${cost.butts} 🚬` : cost.gold ? `${cost.gold} 🪙` : '';
              const why = needFail(o.need, p);
              const need = o.need?.tattoo
                ? `🖋️ ${tattooById.get(o.need.tattoo)?.name}`
                : o.need?.mast
                  ? o.need.mast.map((m) => `${mastById.get(m)?.emoji} ${mastById.get(m)?.name}`).join(', ')
                  : o.need?.level
                    ? `⭐ ${o.need.level} ур.`
                    : '';
              return (
                <button
                  key={i}
                  className={`ev-opt ${o.need ? 'ev-opt-need' : ''} ${i === ev.options.length - 1 && ev.options.length > 1 && !o.cost && !o.need ? 'ev-opt-dim' : ''}`}
                  disabled={busy || !!why || p.money < money || p.butts < (cost.butts ?? 0) || p.gold < (cost.gold ?? 0)}
                  onClick={() => pick(i)}
                >
                  <span className="ev-lbl">
                    {why ? '🔒 ' : ''}
                    {label}
                  </span>
                  {need && <small className="ev-need">{need}</small>}
                  {tag && <small>{tag}</small>}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {res.next && <div className="ev-next">⏳ Продолжение следует — загляни через пару минут</div>}
            <button className="btn btn-wide" onClick={onClose}>
              Дальше
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Мигающий «!» — на зоне что-то случилось. */
export function EventButton() {
  const { p, now } = useGame();
  const open = useEvent();
  if (!p.event || p.event.until <= now) return null;
  const ev = eventById.get(p.event.id);
  if (!ev) return null;
  return (
    // кружок с лицом того, кто ждёт: не закрывает кнопки внизу экрана
    <button className="event-btn" onClick={() => open()} aria-label={ev.name}>
      <span className="pulse-ring" />
      <NpcPortrait who={ev.who} className="event-face" tight />
      <b className="event-mark">!</b>
    </button>
  );
}
