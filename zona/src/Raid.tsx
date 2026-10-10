import { useEffect, useRef, useState } from 'react';
import { RAID, raidButts } from '../shared/raid.ts';
import { Table } from './Minigames.tsx';
import { Place } from './art/Scenes.tsx';
import { PoseG } from './art/sprites.tsx';
import { lookOf, useGame } from './game.tsx';
import { api, startRun } from './api.ts';
import { play } from './sound.ts';

const W = 300;
const H = 260;
const GROUND = 238;
const HERO_HALF = 16;

interface Para {
  id: number;
  x: number;
  y: number;
  vy: number;
  sway: number;
}

/** Омоновец на парашюте: купол, стропы, шлем и дубинка — в духе мультика. */
function Trooper({ p, t }: { p: Para; t: number }) {
  const sw = Math.sin(t / 300 + p.sway) * 6;
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${sw})`}>
      <path d="M-20,-30 Q0,-56 20,-30 Z" fill="#e04a3a" stroke="#1a1410" strokeWidth={2} />
      <path d="M-20,-30 Q-10,-36 0,-30 Q10,-36 20,-30" fill="#fff" stroke="#1a1410" strokeWidth={1.4} />
      <path d="M-18,-30 L-5,-6 M18,-30 L5,-6 M0,-30 V-8" stroke="#1a1410" strokeWidth={0.8} />
      <rect x={-7} y={-6} width={14} height={14} rx={3} fill="#2a2a30" stroke="#1a1410" strokeWidth={1.6} />
      <circle cx={0} cy={-11} r={7} fill="#e8b48a" stroke="#1a1410" strokeWidth={1.6} />
      <path d="M-7.5,-12 A7.5,7.5 0 0 1 7.5,-12 Z" fill="#3a3a44" stroke="#1a1410" strokeWidth={1.4} />
      <circle cx={-2.6} cy={-9.5} r={1.8} fill="#fff" stroke="#1a1410" strokeWidth={0.6} />
      <circle cx={2.6} cy={-9.5} r={1.8} fill="#fff" stroke="#1a1410" strokeWidth={0.6} />
      <circle cx={-2.2} cy={-9.3} r={0.7} fill="#1a1410" />
      <circle cx={3} cy={-9.3} r={0.7} fill="#1a1410" />
      <path d="M-3,-6.4 h6" stroke="#1a1410" strokeWidth={1} />
      <rect x={7} y={-4} width={3} height={13} rx={1} fill="#1a1410" transform="rotate(20 8 2)" />
    </g>
  );
}

/** «Шмон с неба»: тапай слева/справа или веди пальцем — уводи коробку от десанта. */
export function RaidGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [on, setOn] = useState(false);
  const [res, setRes] = useState<{ sec: number; butts: number; full: boolean } | null>(null);
  const [, setFrame] = useState(0);
  const st = useRef({ x: W / 2, target: W / 2, dir: 1, paras: [] as Para[], t0: 0, last: 0, spawn: 0, id: 0, sec: 0, caught: false });
  const svg = useRef<SVGSVGElement>(null);
  type Top = { rows: { id: number; name: string; sec: number }[]; me: number; total: number };
  const [top, setTop] = useState<Top | null>(null);
  useEffect(() => {
    api.action<{ top: Top }>('raidTop').then((r) => setTop(r.result.top)).catch(() => null);
  }, []);

  const finish = async (sec: number, caught: boolean) => {
    setOn(false);
    play(caught ? 'lose' : 'win');
    const r = await act<{ sec: number; butts: number; full: boolean; top: Top }>('raid', { sec });
    if (r) {
      setRes(r);
      setTop(r.top);
    }
  };

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const s = st.current;
    const tick = (now: number) => {
      const dt = Math.min(50, now - (s.last || now)) / 1000;
      s.last = now;
      s.sec = (now - s.t0) / 1000;
      // десант чаще и быстрее с каждой секундой
      const rate = 0.9 + s.sec * 0.09;
      s.spawn += dt * rate;
      while (s.spawn >= 1) {
        s.spawn -= 1;
        // половина — прицельно над игроком, чтобы стоять на месте было нельзя
        const aim = Math.random() < 0.5 ? s.x + (Math.random() - 0.5) * 60 : 20 + Math.random() * (W - 40);
        s.paras.push({ id: ++s.id, x: Math.max(20, Math.min(W - 20, aim)), y: -40, vy: 55 + s.sec * 4 + Math.random() * 25, sway: Math.random() * 6 });
      }
      // герой бежит к цели
      const dx = s.target - s.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), 170 * dt);
      if (Math.abs(dx) > 1) s.dir = dx > 0 ? 1 : -1;
      s.x += step;
      for (const q of s.paras) q.y += q.vy * dt;
      // приземлился рядом — попался
      for (const q of s.paras) {
        if (q.y >= GROUND - 14 && Math.abs(q.x - s.x) < HERO_HALF + 6) s.caught = true;
      }
      s.paras = s.paras.filter((q) => q.y < GROUND + 10);
      setFrame((f) => f + 1);
      if (s.caught) return void finish(s.sec, true);
      if (s.sec >= RAID.seconds) return void finish(RAID.seconds, false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  const start = () => {
    const s = st.current;
    Object.assign(s, { x: W / 2, target: W / 2, dir: 1, paras: [], t0: performance.now(), last: 0, spawn: 0, sec: 0, caught: false });
    setRes(null);
    startRun('raid');
    play('event');
    setOn(true);
  };
  const steer = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !on) return;
    st.current.target = Math.max(HERO_HALF, Math.min(W - HERO_HALF, ((clientX - r.left) / r.width) * W));
  };

  const s = st.current;
  const now = performance.now();
  const left = Math.max(0, RAID.seconds - s.sec);
  return (
    <Table who="sheet/cast/omon" title="🪂 Шмон с неба" left={`заходов сегодня: ${p.games.raid}`} onClose={onClose}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="raid-field"
        onPointerDown={(e) => steer(e.clientX)}
        onPointerMove={(e) => e.buttons && steer(e.clientX)}
      >
        <rect width={W} height={H} fill="#9cc4e0" />
        <ellipse cx={60} cy={40} rx={30} ry={10} fill="#fff" opacity={0.8} />
        <ellipse cx={220} cy={26} rx={36} ry={11} fill="#fff" opacity={0.8} />
        <rect y={150} width={W} height={60} fill="#8a8778" stroke="#1a1410" strokeWidth={2} />
        {Array.from({ length: 16 }, (_, k) => (
          <circle key={k} cx={k * 20 + 6} cy={148} r={7} fill="none" stroke="#555" strokeWidth={1.4} />
        ))}
        <rect y={GROUND - 30} width={W} height={H - GROUND + 30} fill="#6a675a" />
        {s.paras.map((q) => (
          <g key={q.id}>
            <ellipse cx={q.x} cy={GROUND} rx={10 + (q.y / GROUND) * 10} ry={3} fill="#000" opacity={0.12 + (q.y / GROUND) * 0.25} />
            <Trooper p={q} t={now} />
          </g>
        ))}
        <Place x={s.x} y={GROUND + 6} scale={0.42}>
          <PoseG name="stand" look={lookOf(p)} anim={on ? (Math.abs(s.target - s.x) > 2 ? 'run' : 'guard') : res && !res.full ? 'koSpin' : 'idle'} mirror={s.dir < 0} />
        </Place>
        <text x={s.x} y={GROUND - 78} fontSize={16} textAnchor="middle">
          📦
        </text>
        {on && (
          <text x={W - 10} y={24} fontSize={18} fontWeight={900} textAnchor="end" fill="#fff" stroke="#1a1410" strokeWidth={0.8}>
            {left.toFixed(1)}
          </text>
        )}
      </svg>
      <div className={`verdict ${res && res.butts > 0 ? 'win' : ''}`}>
        {res
          ? res.full
            ? `Продержался все ${RAID.seconds} с! +${res.butts} 🚬 — ОМОН ушёл ни с чем`
            : `Повязали на ${res.sec} с. +${res.butts} 🚬 — часть успел скинуть`
          : on
            ? `Уже ${raidButts(s.sec)} 🚬 — бегай!`
            : 'Тапай или веди пальцем — уводи коробку от десанта'}
      </div>
      {!on && (
        <button className="btn btn-wide" disabled={busy || p.games.raid <= 0} onClick={start}>
          {p.games.raid <= 0 ? 'Завтра' : res ? 'Ещё раз' : 'Начать шмон'}
        </button>
      )}
      {!on && top && top.rows.length > 0 && (
        <div className="raid-top">
          <b>🏆 Рекорды недели</b>
          {top.rows.map((r, i) => (
            <div key={r.id} className={r.id === p.id ? 'me' : ''}>
              <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
              <span className="grow">{r.name}</span>
              <span>{r.sec >= RAID.seconds ? '🏁 все 20 с' : `${r.sec} с`}</span>
            </div>
          ))}
          {top.me > 10 && <small>Ты — {top.me} из {top.total}</small>}
        </div>
      )}
    </Table>
  );
}
