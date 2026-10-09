import { useEffect, useRef, useState } from 'react';
import { TATTOOS, tattooById } from '../shared/content.ts';
import { INK, inkRank } from '../shared/ink.ts';
import { api } from './api.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

type Inker = Awaited<ReturnType<typeof api.inkers>>['list'][number];
const avg = (r: { stars: number; votes: number }) => (r.votes ? (r.stars / r.votes).toFixed(1) : '—');

/** Кольщик в профиле: заказать наколку у живого мастера или бить самому. */
export function InkCard() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  const o = p.inkOrder;
  const queue = p.ink?.queue.length ?? 0;
  const t = o && tattooById.get(o.tattoo);
  return (
    <>
      <button className={`pen-card ink-card ${queue || (o?.done && !o.rated) ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">🖋️</span>
        <span className="grow">
          <b>Кольщик {queue > 0 && <span className="mal-badge">{queue}</span>}</b>
          <small>
            {p.ink
              ? `${inkRank(p.ink.skill)} · опыт ${p.ink.skill} · ⭐ ${avg(p.ink)}`
              : o && t
                ? o.done
                  ? `${t.emoji} набита — оцени мастера`
                  : `${t.emoji} ждёшь у ${o.artistName} · ${timeLeft(now - o.at)}`
                : 'Набить у живого мастера дешевле'}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <InkModal onClose={() => setOpen(false)} />}
    </>
  );
}

function InkModal({ onClose }: { onClose(): void }) {
  const { p } = useGame();
  const [tab, setTab] = useState<'order' | 'master'>(p.ink?.queue.length ? 'master' : 'order');
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <div className="row gap-s">
          <button className={`btn grow ${tab === 'order' ? '' : 'btn-dark'}`} onClick={() => setTab('order')}>
            🙋 Набить
          </button>
          <button className={`btn grow ${tab === 'master' ? '' : 'btn-dark'}`} onClick={() => setTab('master')}>
            🖋️ Моя машинка
          </button>
        </div>
        {tab === 'order' ? <OrderTab /> : <MasterTab />}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

function OrderTab() {
  const { p, now, act, busy, toast } = useGame();
  const [list, setList] = useState<Inker[] | null>(null);
  const [pick, setPick] = useState<Inker | null>(null);
  useEffect(() => {
    api.inkers().then((r) => setList(r.list.filter((x) => x.id !== p.id))).catch(() => setList([]));
  }, []);
  const o = p.inkOrder;
  if (o && (!o.done || !o.rated)) {
    const t = tattooById.get(o.tattoo)!;
    return (
      <div className="ink-order">
        <span className="ink-big">{t.emoji}</span>
        <b>
          «{t.name}» у {o.artistName}
        </b>
        {o.done ? (
          <>
            <small>Качество {o.quality}%{o.quality < INK.crooked ? ' — криво…' : ''}. Оцени мастера:</small>
            <div className="ink-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} disabled={busy} onClick={() => act('inkRate', { stars: n }).then((r) => r && toast(`⭐ ${n} — спасибо`))}>
                  ⭐
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <small>Мастер ещё не взялся. Ждёшь {timeLeft(now - o.at)}.</small>
            <button className="btn btn-dark" disabled={busy || now - o.at < INK.cancelH * 3600_000} onClick={() => act('inkCancel')}>
              {now - o.at < INK.cancelH * 3600_000 ? `Отменить можно через ${timeLeft(o.at + INK.cancelH * 3600_000 - now)}` : '↩️ Забрать деньги'}
            </button>
          </>
        )}
      </div>
    );
  }
  if (pick) {
    const avail = TATTOOS.filter((t) => t.currency === 'money' && !p.tattoos.includes(t.id));
    return (
      <div className="ink-pick">
        <b>
          Мастер {pick.name} · {inkRank(pick.skill)} · ⭐ {avg(pick)}
        </b>
        <small className="muted">Цена — {Math.round(INK.discount * 100)}% от ларька, деньги мастеру. Качество зависит от его руки.</small>
        <div className="ink-grid">
          {avail.map((t) => {
            const lock = p.level < t.minLevel || p.authority < t.minAuthority;
            const price = Math.round(t.price * INK.discount);
            return (
              <button
                key={t.id}
                className="pet-offer"
                disabled={busy || lock || p.money < price}
                onClick={async () => {
                  const r = await act('inkOrder', { artist: pick.id, tattoo: t.id });
                  if (r) toast(`🖋️ Записался к ${pick.name}`);
                }}
              >
                <span className="pet-ico">{t.emoji}</span>
                <small>{t.name}</small>
                <i>{lock ? `🔒 ур. ${t.minLevel}` : `${fmt(price)} ₽`}</i>
              </button>
            );
          })}
        </div>
        <button className="btn btn-dark btn-wide" onClick={() => setPick(null)}>
          ← К мастерам
        </button>
      </div>
    );
  }
  return (
    <div className="ink-list">
      {!list && <div className="muted center">Загрузка…</div>}
      {list?.length === 0 && <div className="muted center">На зоне пока ни одного кольщика. Стань первым!</div>}
      {list?.map((r) => (
        <button key={r.id} className="ink-row" disabled={r.queue >= INK.queue} onClick={() => setPick(r)}>
          <span className="pen-ico">🖋️</span>
          <span className="grow">
            <b>{r.name}</b>
            <small>
              {inkRank(r.skill)} · опыт {r.skill} · работ {r.jobs} · очередь {r.queue}/{INK.queue}
            </small>
          </span>
          <b className="ink-rate">⭐ {avg(r)}</b>
        </button>
      ))}
    </div>
  );
}

function MasterTab() {
  const { p, act, busy, toast } = useGame();
  const [doing, setDoing] = useState<number | null>(null);
  if (!p.ink)
    return (
      <div className="ink-order">
        <span className="ink-big">🖋️</span>
        <b>Стать кольщиком</b>
        <small>Машинка из моторчика и струны. Клиенты платят тебе, опыт растёт с каждой работой, а кривые наколки бьют по рейтингу.</small>
        <button className="btn" disabled={busy || p.level < INK.minLevel || p.money < INK.machinePrice} onClick={() => act('inkBecome').then((r) => r !== null && toast('🖋️ Машинка собрана'))}>
          {p.level < INK.minLevel ? `🔒 С ${INK.minLevel} уровня` : `Собрать машинку · ${fmt(INK.machinePrice)} ₽`}
        </button>
      </div>
    );
  const order = doing !== null ? p.ink.queue.find((o) => o.id === doing) : null;
  if (order)
    return (
      <InkGame
        tattoo={order.tattoo}
        onDone={async (acc) => {
          const r = await act<{ quality: number; crooked: boolean; paid: number }>('inkDo', { order: order.id, acc });
          if (r) toast(r.crooked ? `😬 Криво вышло (${r.quality}%) · +${fmt(r.paid)} ₽` : `🖋️ Готово: ${r.quality}% · +${fmt(r.paid)} ₽`, r.crooked ? 'err' : undefined);
          setDoing(null);
        }}
      />
    );
  return (
    <div className="ink-list">
      <div className="ink-me">
        <b>{inkRank(p.ink.skill)}</b>
        <div className="pet-bar">
          <i style={{ width: `${p.ink.skill}%` }} />
        </div>
        <small>
          опыт {p.ink.skill}/100 · работ {p.ink.jobs} · ⭐ {avg(p.ink)} ({p.ink.votes})
        </small>
      </div>
      {p.ink.queue.length === 0 && <div className="muted center">Очередь пуста. Клиенты найдут тебя в списке мастеров.</div>}
      {p.ink.queue.map((o) => {
        const t = tattooById.get(o.tattoo)!;
        return (
          <div key={o.id} className="ink-row">
            <span className="pen-ico">{t.emoji}</span>
            <span className="grow">
              <b>{o.clientName}</b>
              <small>
                «{t.name}» · {fmt(o.paid)} ₽
              </small>
            </span>
            <button className="btn btn-s" disabled={busy} onClick={() => setDoing(o.id)}>
              Бить
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Игла ходит туда-сюда: жми, когда она в зелёной зоне. Пять уколов — точность в среднем. */
function InkGame({ tattoo, onDone }: { tattoo: string; onDone(acc: number): void }) {
  const t = tattooById.get(tattoo)!;
  const [pos, setPos] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const posRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const speed = 1.6 + Math.random() * 0.6;
    const loop = (now: number) => {
      const x = (Math.sin(((now - t0) / 1000) * speed * Math.PI) + 1) / 2;
      posRef.current = x;
      setPos(x);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const tap = () => {
    if (hits.length >= INK.taps) return;
    const acc = Math.max(0, 1 - Math.abs(posRef.current - 0.5) * 2.5);
    const next = [...hits, acc];
    setHits(next);
    if (next.length === INK.taps) setTimeout(() => onDone(next.reduce((a, b) => a + b, 0) / next.length), 500);
  };
  const done = hits.length / INK.taps;
  return (
    <div className="ink-game" onPointerDown={tap}>
      <div className="ink-skin">
        <span className="ink-stencil">{t.emoji}</span>
        <span className="ink-fill" style={{ clipPath: `inset(${100 - done * 100}% 0 0 0)` }}>
          {t.emoji}
        </span>
      </div>
      <div className="ink-track">
        <span className="ink-zone" />
        <span className="ink-needle" style={{ left: `${pos * 100}%` }}>
          🖋️
        </span>
      </div>
      <div className="ink-dots">
        {Array.from({ length: INK.taps }, (_, i) => (
          <span key={i} className={hits[i] === undefined ? '' : hits[i] > 0.7 ? 'good' : hits[i] > 0.3 ? 'ok' : 'bad'} />
        ))}
      </div>
      <small className="muted">Жми, когда игла в зелёной зоне</small>
    </div>
  );
}
