import { useEffect, useRef, useState } from 'react';
import { SLING, slingButts } from '../shared/sling.ts';
import { Table } from './Minigames.tsx';
import { startRun } from './api.ts';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

const W = 300;
const H = 220;
const INK = '#1a1410';
const ORIGIN = { x: 40, y: 180 };
const WINDOW = { x: 238, y: 92, w: 30, h: 26 };
const G = 260; // гравитация, пикс/с²

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  done: '' | 'hit' | 'miss' | 'caught';
}

/** «Перекинь маляву»: тяни назад и отпускай. Ветер сносит, вертухай на стене ловит. */
export function SlingGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [on, setOn] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [aim, setAim] = useState<{ dx: number; dy: number } | null>(null);
  const [hits, setHits] = useState(0);
  const [left, setLeft] = useState(SLING.shots);
  const [wind, setWind] = useState(0);
  const [res, setRes] = useState<{ hits: number; butts: number } | null>(null);
  const [t, setT] = useState(0);
  const start0 = useRef(performance.now());
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // вертухай ходит по стене туда-сюда
  const guardX = 150 + Math.sin(t / 900) * 40;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT(now - start0.current);
      setShot((s) => {
        if (!s || s.done) return s;
        const n = { ...s, vx: s.vx + wind * 60 * dt, vy: s.vy + G * dt };
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        // вертухай на стене (y≈120) перехватывает
        if (Math.abs(n.x - (150 + Math.sin((now - start0.current) / 900) * 40)) < 14 && Math.abs(n.y - 112) < 16) return { ...n, done: 'caught' };
        if (n.x > WINDOW.x && n.x < WINDOW.x + WINDOW.w && n.y > WINDOW.y && n.y < WINDOW.y + WINDOW.h) return { ...n, done: 'hit' };
        if (n.y > H + 20 || n.x > W + 20 || n.x < -20) return { ...n, done: 'miss' };
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wind]);

  // выстрел закончился: считаем и готовим следующий
  useEffect(() => {
    if (!shot?.done) return;
    const hit = shot.done === 'hit';
    play(hit ? 'coin' : shot.done === 'caught' ? 'error' : 'miss');
    const nh = hits + (hit ? 1 : 0);
    const nl = left - 1;
    const tm = setTimeout(async () => {
      setHits(nh);
      setLeft(nl);
      setShot(null);
      setWind(Math.round((Math.random() * 2 - 1) * 10) / 10);
      if (nl <= 0) {
        setOn(false);
        const r = await act<{ hits: number; butts: number }>('sling', { hits: nh });
        if (r) setRes(r);
      }
    }, 900);
    return () => clearTimeout(tm);
  }, [shot?.done]);

  const begin = () => {
    setHits(0);
    setLeft(SLING.shots);
    setRes(null);
    setShot(null);
    setWind(Math.round((Math.random() * 2 - 1) * 10) / 10);
    startRun('sling');
    setOn(true);
  };
  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: React.PointerEvent) => {
    if (!on || shot) return;
    drag.current = pt(e);
    setAim({ dx: 0, dy: 0 });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const q = pt(e);
    setAim({ dx: Math.max(-60, Math.min(0, q.x - drag.current.x)), dy: Math.max(-10, Math.min(60, q.y - drag.current.y)) });
  };
  const up = () => {
    if (!drag.current || !aim) return;
    drag.current = null;
    // тянул назад-вниз — летит вперёд-вверх
    setShot({ x: ORIGIN.x, y: ORIGIN.y, vx: -aim.dx * 4.2, vy: -aim.dy * 4.6, done: '' });
    setAim(null);
    play('whoosh');
  };

  return (
    <Table who="sheet/cast/youngster" title="🎯 Перекинь маляву" left={`заходов сегодня: ${p.games.sling}`} onClose={onClose}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="raid-field" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <rect width={W} height={H} fill="#9cc4e0" />
        {/* соседний барак с окном */}
        <rect x={210} y={60} width={90} height={160} fill="#c9a77a" stroke={INK} strokeWidth={2.4} />
        <path d="M204,62 L255,36 L306,62 Z" fill="#6a4a36" stroke={INK} strokeWidth={2.4} />
        <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.w} height={WINDOW.h} fill="#ffe28a" stroke={INK} strokeWidth={2} />
        <path d={`M${WINDOW.x + 10},${WINDOW.y} V${WINDOW.y + WINDOW.h} M${WINDOW.x + 20},${WINDOW.y} V${WINDOW.y + WINDOW.h}`} stroke={INK} strokeWidth={1.4} />
        {/* забор и вертухай на нём */}
        <rect x={120} y={120} width={60} height={100} fill="#9a968a" stroke={INK} strokeWidth={2.4} />
        {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={124 + i * 13} cy={116} r={5} fill="none" stroke={INK} strokeWidth={1.2} />)}
        <g transform={`translate(${guardX} 112)`}>
          <rect x={-6} y={-6} width={12} height={14} rx={3} fill="#2a3446" stroke={INK} strokeWidth={1.4} />
          <circle cy={-12} r={7} fill="#e8b48a" stroke={INK} strokeWidth={1.4} />
          <path d="M-8,-14 h16 l-2,-5 h-12 Z" fill="#2a3446" stroke={INK} strokeWidth={1.2} />
          <circle cx={-2.4} cy={-11} r={1.4} fill={INK} />
          <circle cx={2.4} cy={-11} r={1.4} fill={INK} />
        </g>
        <rect y={196} width={210} height={24} fill="#7a7564" stroke={INK} strokeWidth={2} />
        {/* ветер */}
        <g transform="translate(60 22)">
          <text x={0} y={0} fontSize={10} fontWeight={900} fill={INK}>
            ветер {wind > 0 ? '→' : wind < 0 ? '←' : '·'} {Math.abs(wind).toFixed(1)}
          </text>
        </g>
        {/* рогатка */}
        <path d={`M${ORIGIN.x - 8},${ORIGIN.y - 14} L${ORIGIN.x},${ORIGIN.y + 4} L${ORIGIN.x + 8},${ORIGIN.y - 14} M${ORIGIN.x},${ORIGIN.y + 4} V${ORIGIN.y + 20}`} stroke="#7a4a2a" strokeWidth={4} fill="none" strokeLinecap="round" />
        {aim && (
          <>
            <path d={`M${ORIGIN.x - 8},${ORIGIN.y - 14} L${ORIGIN.x + aim.dx},${ORIGIN.y - 10 + aim.dy} L${ORIGIN.x + 8},${ORIGIN.y - 14}`} stroke="#3a2a1a" strokeWidth={1.6} fill="none" />
            <path d={`M${ORIGIN.x},${ORIGIN.y - 10} l${-aim.dx * 1.6},${-aim.dy * 1.6}`} stroke="#fff" strokeWidth={1.4} strokeDasharray="4 3" />
          </>
        )}
        {shot && (
          <g transform={`translate(${shot.x} ${shot.y}) rotate(${t / 3})`}>
            <rect x={-5} y={-3} width={10} height={6} fill="#fff" stroke={INK} strokeWidth={1} />
          </g>
        )}
        {shot?.done && (
          <text x={150} y={50} fontSize={18} fontWeight={900} textAnchor="middle" fill="#fff" stroke={INK} strokeWidth={0.8}>
            {shot.done === 'hit' ? 'ДОШЛА! ✉️' : shot.done === 'caught' ? 'ПЕРЕХВАТ! 👮' : 'МИМО'}
          </text>
        )}
      </svg>
      <div className={`verdict ${res && res.butts > 0 ? 'win' : ''}`}>
        {res
          ? `Дошло ${res.hits} из ${SLING.shots} · +${res.butts} 🚬`
          : on
            ? `Осталось ${left} · попаданий ${hits} · уже ${slingButts(hits)} 🚬`
            : 'Тяни пальцем назад-вниз от рогатки и отпускай. Целься в окно, бойся вертухая'}
      </div>
      {!on && (
        <button className="btn btn-wide" disabled={busy || p.games.sling <= 0} onClick={begin}>
          {p.games.sling <= 0 ? 'Завтра' : res ? 'Ещё заход' : 'Зарядить рогатку'}
        </button>
      )}
    </Table>
  );
}
