import { useEffect, useRef, useState } from 'react';
import { CONTRA, GOODS, HIDE_SPOTS, goodPrice, type GoodId } from '../shared/contra.ts';
import { fmt, useGame } from './game.tsx';

/** Контрабанда на «Рынке»: график цены, закупка через кабур и сдача внутри. */
export function ContraCard() {
  const { p, act, busy, toast } = useGame();
  const [sel, setSel] = useState<GoodId>('tea');
  const [shmon, setShmon] = useState(false);
  if (p.level < CONTRA.minLevel) return null;
  const c = p.contra;
  const day = c.day;
  const g = GOODS.find((x) => x.id === sel)!;
  const hist = Array.from({ length: CONTRA.history }, (_, i) => goodPrice(g, day - CONTRA.history + 1 + i));
  const price = hist[hist.length - 1];
  const buy = Math.round(price * CONTRA.buyMul);
  const sell = Math.round(price * CONTRA.sellMul);
  const have = c.have[sel] ?? 0;
  const total = Object.values(c.have).reduce((a, b) => a + (b ?? 0), 0);
  const trade = async (isBuy: boolean, qty: number) => {
    const r = await act<{ money: number }>('contraTrade', { good: sel, qty, buy: isBuy });
    if (r) toast(`${g.emoji} ${isBuy ? 'Закупил' : 'Сдал'} ×${qty}: ${r.money > 0 ? '+' : ''}${fmt(r.money)} ₽`);
  };
  return (
    <div className="con-wrap">
      <div className="con-head">
        <b>📦 Контрабанда через кабур</b>
        <small>
          в нычке {total}/{CONTRA.cap} · навар {fmt(c.earned - c.spent)} ₽
        </small>
      </div>
      {c.shmon && (
        <button className="shmon-alarm" onClick={() => setShmon(true)}>
          🔦 Ночью шмон! Спрячь товар, пока не поздно
        </button>
      )}
      <div className="con-tabs">
        {GOODS.map((x) => {
          const now = goodPrice(x, day);
          const prev = goodPrice(x, day - 1);
          return (
            <button key={x.id} className={x.id === sel ? 'on' : ''} onClick={() => setSel(x.id)}>
              <span>{x.emoji}</span>
              <small className={now >= prev ? 'up' : 'down'}>
                {now >= prev ? '▲' : '▼'} {Math.abs(Math.round(((now - prev) / prev) * 100))}%
              </small>
              {(c.have[x.id] ?? 0) > 0 && <i>{c.have[x.id]}</i>}
            </button>
          );
        })}
      </div>
      <PriceChart name={g.name} values={hist} />
      <div className="con-trade">
        <div>
          <small>закупка</small>
          <b>{fmt(buy)} ₽</b>
          <span className="row gap-s">
            {[1, 5].map((n) => (
              <button key={n} className="btn btn-s" disabled={busy || c.shmon || total + n > CONTRA.cap || p.money < buy * n} onClick={() => trade(true, n)}>
                +{n}
              </button>
            ))}
          </span>
        </div>
        <div>
          <small>сдать · у тебя {have}</small>
          <b>{fmt(sell)} ₽</b>
          <span className="row gap-s">
            {[1, have].filter((n, i, a) => n > 0 && a.indexOf(n) === i).map((n) => (
              <button key={n} className="btn btn-s btn-dark" disabled={busy || c.shmon} onClick={() => trade(false, n)}>
                −{n === have && n > 1 ? 'всё' : n}
              </button>
            ))}
          </span>
        </div>
      </div>
      {shmon && <ShmonModal onClose={() => setShmon(false)} />}
    </div>
  );
}

/** Цена за две недели: одна линия, крестик с подсказкой по касанию. */
function PriceChart({ name, values }: { name: string; values: number[] }) {
  const W = 300;
  const H = 110;
  const pad = { l: 34, r: 10, t: 10, b: 18 };
  const [hover, setHover] = useState<number | null>(null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  const h = hover ?? last;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(last, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * last))));
  };
  return (
    <div className="con-chart">
      <div className="con-tip">
        <b>{fmt(values[h])} ₽</b> <small>{name} · {h === last ? 'сегодня' : `${last - h} дн. назад`}</small>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} role="img" aria-label={`${name}: цена за ${values.length} дней, сейчас ${values[last]} ₽`}>
        {[min, (min + max) / 2, max].map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="con-grid" />
            <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" className="con-axis">
              {fmt(Math.round(v))}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} className="con-axis">−{last} дн.</text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="con-axis">сегодня</text>
        <path d={d} className="con-line" />
        <line x1={x(h)} x2={x(h)} y1={pad.t} y2={H - pad.b} className="con-cross" />
        <circle cx={x(h)} cy={y(values[h])} r={4.5} className="con-dot" />
      </svg>
    </div>
  );
}

/** Ночной шмон: за 12 секунд разложи товар по тайникам. Потом вертухай с фонарём проверяет. */
function ShmonModal({ onClose }: { onClose(): void }) {
  const { p, act } = useGame();
  const goods = GOODS.filter((g) => (p.contra.have[g.id] ?? 0) > 0);
  const [hide, setHide] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<GoodId | null>(goods[0]?.id ?? null);
  const [left, setLeft] = useState(12);
  const [res, setRes] = useState<{ lost: Partial<Record<GoodId, number>>; checked: string[] } | null>(null);
  const sent = useRef(false);
  const send = async () => {
    if (sent.current) return;
    sent.current = true;
    const r = await act<{ lost: Partial<Record<GoodId, number>>; checked: string[] }>('shmonHide', { hide });
    if (r) setRes(r);
  };
  useEffect(() => {
    if (res) return;
    const id = setInterval(() => setLeft((l) => (l <= 1 ? (clearInterval(id), send(), 0) : l - 1)), 1000);
    return () => clearInterval(id);
  }, [res, hide]);
  const spotOf = (sid: string) => Object.entries(hide).find(([, s]) => s === sid)?.[0] as GoodId | undefined;
  return (
    <div className="modal">
      <div className="modal-body">
        <h3 className="center">🔦 Ночной шмон {res ? '' : `· ${left} с`}</h3>
        <div className={`shmon-room ${res ? 'search' : ''}`}>
          {HIDE_SPOTS.map((s, i) => {
            const gid = spotOf(s.id);
            const found = res?.checked.includes(s.id);
            return (
              <button
                key={s.id}
                className={`shmon-spot s${i} ${gid ? 'full' : ''} ${res ? (found ? 'found' : 'safe') : ''}`}
                disabled={!!res}
                onClick={() => {
                  if (!pick) return;
                  setHide((h) => ({ ...Object.fromEntries(Object.entries(h).filter(([g, sp]) => g !== pick && sp !== s.id)), [pick]: s.id }));
                  const next = goods.find((g) => g.id !== pick && !hide[g.id]);
                  setPick(next?.id ?? null);
                }}
              >
                <span>{s.emoji}</span>
                <small>{s.name}</small>
                {gid && <i>{GOODS.find((g) => g.id === gid)!.emoji}</i>}
                {res && <b>{found ? '🔦' : '✓'}</b>}
              </button>
            );
          })}
          {res && <div className="shmon-beam" />}
        </div>
        {!res ? (
          <>
            <div className="shmon-goods">
              {goods.map((g) => (
                <button key={g.id} className={`${pick === g.id ? 'on' : ''} ${hide[g.id] ? 'hid' : ''}`} onClick={() => setPick(g.id)}>
                  {g.emoji} ×{p.contra.have[g.id]}
                </button>
              ))}
            </div>
            <small className="muted center">Тапни товар, потом тайник. Один тайник — один товар. Не спрятал — найдут.</small>
            <button className="btn btn-wide" onClick={send}>
              🤫 Затаиться
            </button>
          </>
        ) : (
          <div className="fam-end">
            <b>{Object.keys(res.lost).length ? 'Нашли и изъяли' : 'Ничего не нашли!'}</b>
            <small>
              {Object.entries(res.lost)
                .map(([g, n]) => `${GOODS.find((x) => x.id === g)!.emoji} ×${n}`)
                .join(' · ') || 'Вертухай ушёл ни с чем'}
            </small>
            <button className="btn btn-wide btn-dark" onClick={onClose}>
              Ясно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
