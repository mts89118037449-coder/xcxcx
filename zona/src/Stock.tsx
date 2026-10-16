import { useEffect, useRef, useState } from 'react';
import { STOCK } from '../shared/stock.ts';
import { ModalHead } from './Nav.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, useNpc } from './art/sprites.tsx';
import { api, startRun } from './api.ts';
import { Card, useGame } from './game.tsx';
import { play } from './sound.ts';

const INK = '#1a1410';
type View = { total: number; goal: number; top: { id: number; name: string; boxes: number }[]; claimable: boolean };
const SLOTS = Array.from({ length: 12 }, (_, i) => ({ x: 30 + (i % 4) * 52, y: 46 + Math.floor(i / 4) * 52 }));

/** Карточка налёта в клане: сколько вынесли за неделю и кнопка «на склад». */
export function StockCard() {
  const { p, act, busy } = useGame();
  const [v, setV] = useState<View | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.action<View>('stockView').then((r) => setV(r.result)).catch(() => null);
  }, [open]);
  if (!p.clan) return null;
  return (
    <Card>
      <b>📦 Налёт на склад завхоза</b>
      <div className="muted small">Всей неделей кланом вынесите {STOCK.goal} коробок — каждому {STOCK.gold} 🪙 и {STOCK.butts} 🚬.</div>
      {v && (
        <>
          <div className="bar reno-bar" style={{ margin: '6px 0' }}>
            <div style={{ width: `${Math.min(100, (100 * v.total) / v.goal)}%` }} />
          </div>
          <small className="muted">
            {v.total}/{v.goal} · {v.top.map((m) => `${m.name} ${m.boxes}`).join(' · ')}
          </small>
        </>
      )}
      {v?.claimable ? (
        <button className="btn btn-wide btn-gold" disabled={busy} onClick={async () => (await act('stockClaim')) && setV({ ...v, claimable: false })}>
          🎁 Забрать долю
        </button>
      ) : (
        <button className="btn btn-wide" disabled={p.games.stock <= 0} onClick={() => setOpen(true)}>
          {p.games.stock <= 0 ? 'Завтра снова на склад' : `На склад! (заходов: ${p.games.stock})`}
        </button>
      )}
      {open && <StockGame onClose={() => setOpen(false)} />}
    </Card>
  );
}

/** Сама вылазка: хватай коробки, пока завхоз отвернулся. Схватил при нём — отберёт три. */
function StockGame({ onClose }: { onClose(): void }) {
  const { act, busy } = useGame();
  const zav = useNpc('sheet/boss/b_zavhoz');
  const [on, setOn] = useState(false);
  const [left, setLeft] = useState(STOCK.seconds);
  const [boxes, setBoxes] = useState(0);
  const [lit, setLit] = useState<number[]>([]);
  const [looking, setLooking] = useState(false);
  const [warn, setWarn] = useState(false);
  const [res, setRes] = useState<number | null>(null);
  const t0 = useRef(0);
  const count = useRef(0);
  useEffect(() => {
    if (!on) return;
    const tick = setInterval(() => {
      const el = (performance.now() - t0.current) / 1000;
      setLeft(Math.max(0, STOCK.seconds - el));
      // завхоз оборачивается раз в 2.5–4 с, перед этим — «кхм»
      const ph = el % 3.4;
      setWarn(ph > 2.1 && ph < 2.5);
      setLooking(ph >= 2.5);
      setLit((l) => {
        const next = l.filter(() => Math.random() > 0.15);
        if (next.length < 5) next.push(Math.floor(Math.random() * SLOTS.length));
        return [...new Set(next)];
      });
      if (el >= STOCK.seconds) {
        clearInterval(tick);
        setOn(false);
        act<{ boxes: number }>('stockRaid', { boxes: count.current }).then((r) => {
          if (r) {
            setRes(r.boxes);
            play('win');
          }
        });
      }
    }, 120);
    return () => clearInterval(tick);
  }, [on]);
  const grab = (i: number) => {
    if (!on || !lit.includes(i)) return;
    if (looking) {
      count.current = Math.max(0, count.current - 3);
      setBoxes(count.current);
      play('error');
      return;
    }
    count.current++;
    setBoxes(count.current);
    setLit((l) => l.filter((x) => x !== i));
    play('pop');
  };
  const begin = () => {
    count.current = 0;
    setBoxes(0);
    setRes(null);
    t0.current = performance.now();
    startRun('stock');
    setOn(true);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="📦 Склад завхоза" />
        <svg viewBox="0 0 300 200" className="pillow-field">
          <rect width={300} height={200} fill="#8a7a62" />
          {[0, 1, 2].map((r) => <rect key={r} x={10} y={70 + r * 52} width={220} height={6} fill="#5a3a24" stroke={INK} strokeWidth={1.6} />)}
          {SLOTS.map((s, i) =>
            lit.includes(i) ? (
              <g key={i} transform={`translate(${s.x} ${s.y})`} className="npc-click" onClick={() => grab(i)}>
                <rect x={-14} y={-14} width={34} height={28} fill="#c9a77a" stroke={INK} strokeWidth={1.8} />
                <path d="M-14,-4 H20 M3,-14 V14" stroke="#8a6a44" strokeWidth={1.4} />
                <text x={3} y={10} fontSize={7} textAnchor="middle" fill={INK} fontWeight={900}>
                  {['ЧАЙ', 'ТУШ', 'САХ', 'МЫЛО'][i % 4]}
                </text>
              </g>
            ) : null,
          )}
          {zav && (
            <Place x={266} y={198} scale={0.55}>
              <ImageG url={zav.url} height={zav.height} mirror={looking} anim={looking ? 'crossed' : 'idle'} />
            </Place>
          )}
          {warn && (
            <text x={256} y={60} fontSize={12} fontWeight={900} fill="#fff" stroke={INK} strokeWidth={0.6}>
              КХМ…
            </text>
          )}
          {looking && (
            <text x={150} y={24} fontSize={16} fontWeight={900} textAnchor="middle" fill="#ff4a3a" stroke={INK} strokeWidth={0.8}>
              👀 СМОТРИТ! НЕ ТРОГАЙ!
            </text>
          )}
          {on && (
            <text x={10} y={20} fontSize={14} fontWeight={900} fill="#fff" stroke={INK} strokeWidth={0.6}>
              {left.toFixed(1)} · 📦 {boxes}
            </text>
          )}
        </svg>
        <div className={`verdict ${res ? 'win' : ''}`}>{res !== null ? `Вынес ${res} коробок для клана!` : on ? 'Хватай, пока завхоз отвернулся!' : 'Тапай коробки. Когда завхоз смотрит — замри, иначе отберёт три'}</div>
        {!on && (
          <button className="btn btn-wide" disabled={busy || res !== null} onClick={begin}>
            {res !== null ? 'Готово' : 'Начать налёт'}
          </button>
        )}
      </div>
    </div>
  );
}
