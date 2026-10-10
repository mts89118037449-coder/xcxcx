import { useEffect, useRef, useState } from 'react';
import { TUNNEL } from '../shared/tunnel.ts';
import { MATS } from '../shared/craft.ts';
import { startRun } from './api.ts';
import { timeLeft, useGame } from './game.tsx';

/** Подкоп в профиле: разрез земли с лазом и кнопка «копать». */
export function TunnelCard() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < TUNNEL.minLevel) return null;
  const t = p.tunnel;
  const ready = !t.done && (t.depth >= TUNNEL.goal || now - t.digAt >= TUNNEL.cooldownH * 3600_000);
  return (
    <>
      <button className={`pen-card tun-card ${ready ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">⛏️</span>
        <span className="grow">
          <b>Подкоп</b>
          <small>{t.done ? 'ушёл подкопом в эту ходку' : `${t.depth} / ${TUNNEL.goal} м${t.masked ? ' · 🪵 замаскирован' : ''}`}</small>
          {!t.done && (
            <span className="pet-bar">
              <i style={{ width: `${(t.depth / TUNNEL.goal) * 100}%`, background: 'linear-gradient(90deg,#6a4a2a,#c08a4a)' }} />
            </span>
          )}
        </span>
        <i>▸</i>
      </button>
      {open && <TunnelModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TunnelModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const [digging, setDigging] = useState(false);
  const t = p.tunnel;
  const wait = t.digAt + TUNNEL.cooldownH * 3600_000 - now;
  const mats = Object.entries(TUNNEL.mask.mats).map(([id, n]) => ({ m: MATS.find((x) => x.id === id)!, n }));
  const canMask = mats.every(({ m, n }) => (p.mats[m.id] ?? 0) >= n);
  const finish = async (acc: number) => {
    const r = await act<{ found: boolean; lost: number; dug: number; depth: number }>('tunnelDig', { acc });
    setDigging(false);
    if (r) toast(r.found ? `🔦 Шмон нашёл лаз! Засыпали ${r.lost} м, +${TUNNEL.foundTerm} дн.` : `⛏️ +${r.dug} м · всего ${r.depth} м`, r.found ? 'err' : undefined);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h3 className="center">⛏️ Подкоп</h3>
        <TunnelArt depth={t.depth} digging={digging} done={t.done} />
        {digging ? (
          <DigGame onDone={finish} />
        ) : t.done ? (
          <div className="center muted">Ты ушёл подкопом. Новый лаз — в следующую ходку.</div>
        ) : t.depth >= TUNNEL.goal ? (
          <button className="btn btn-wide" disabled={busy} onClick={() => act<{ cut: number }>('tunnelEscape').then((r) => r && toast(`🏃 Ушёл подкопом! −${r.cut} дн. срока`))}>
            🏃 Уйти подкопом · −{Math.round(TUNNEL.cut * 100)}% срока
          </button>
        ) : (
          <>
            <div className="muted small center">
              Риск шмона: {t.masked ? TUNNEL.riskMasked : TUNNEL.risk}% за раскопку · найдут — засыплют {Math.round(TUNNEL.collapse * 100)}% и +{TUNNEL.foundTerm} дн.
              {t.found > 0 && ` · находили: ${t.found}`}
            </div>
            <div className="row gap-s">
              <button className="btn grow" disabled={busy || wait > 0 || p.energy < TUNNEL.energy} onClick={() => (startRun('tunnelDig'), setDigging(true))}>
                {wait > 0 ? `⏳ ${timeLeft(wait)}` : `⛏️ Копать · ${TUNNEL.energy} ⚡`}
              </button>
              <button className="btn btn-dark grow" disabled={busy || t.masked > 0 || !canMask} onClick={() => act('tunnelMask').then((r) => r !== null && toast('🪵 Лаз замаскирован'))}>
                {t.masked ? `🪵 ещё ${t.masked}` : `🪵 ${mats.map(({ m, n }) => `${m.emoji}${n}`).join(' ')}`}
              </button>
            </div>
          </>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Жми на лопату 5 секунд: чем чаще, тем больше метров. */
function DigGame({ onDone }: { onDone(acc: number): void }) {
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(5);
  const tapsRef = useRef(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const l = 5 - Math.floor((Date.now() - t0) / 1000);
      setLeft(Math.max(0, l));
      if (Date.now() - t0 >= 5000) {
        clearInterval(id);
        onDone(Math.min(1, tapsRef.current / 35));
      }
    }, 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="dig-game">
      <button
        className="dig-btn"
        onPointerDown={() => {
          tapsRef.current++;
          setTaps(tapsRef.current);
        }}
      >
        <span key={taps}>⛏️</span>
      </button>
      <div className="dig-info">
        <b>{left} с</b>
        <span className="pet-bar">
          <i style={{ width: `${Math.min(100, (taps / 35) * 100)}%` }} />
        </span>
        <small>Жми быстрее — больше выкопаешь</small>
      </div>
    </div>
  );
}

/** Разрез: хата сверху, слои земли, лаз вниз и вбок к забору, крот-копатель в забое. */
function TunnelArt({ depth, digging, done }: { depth: number; digging: boolean; done: boolean }) {
  const frac = depth / TUNNEL.goal;
  // путь: вниз 30%, дальше горизонтально к забору
  const down = Math.min(1, frac / 0.3);
  const side = Math.max(0, (frac - 0.3) / 0.7);
  const x0 = 50;
  const y0 = 52;
  const yb = y0 + down * 70;
  const xe = x0 + side * 220;
  return (
    <svg className="tun-art" viewBox="0 0 300 170">
      <rect width={300} height={170} fill="#4a3220" />
      <rect y={50} width={300} height={40} fill="#5a3e28" />
      <rect y={90} width={300} height={40} fill="#4a3220" />
      <rect y={130} width={300} height={40} fill="#3a2618" />
      {[...Array(18)].map((_, i) => (
        <circle key={i} cx={(i * 47) % 300} cy={60 + ((i * 29) % 100)} r={2 + (i % 3)} fill="#2a1a10" opacity={0.6} />
      ))}
      {/* хата и поверхность */}
      <rect width={300} height={50} fill="#2a2a3a" />
      <rect x={10} y={10} width={90} height={40} fill="#6a6258" stroke="#2a2620" />
      <rect x={20} y={22} width={14} height={12} fill="#e8d890" opacity={0.7} />
      <text x={55} y={20} fontSize={8} fill="#fff" textAnchor="middle">хата</text>
      <rect x={10} y={48} width={90} height={3} fill="#3a2a1a" />
      {/* забор */}
      <rect x={268} y={2} width={6} height={50} fill="#888" />
      {[6, 14, 22].map((y) => (
        <path key={y} d={`M240,${y} Q260,${y + 3} 300,${y}`} stroke="#bbb" strokeWidth={1} fill="none" />
      ))}
      <rect x={268} y={50} width={6} height={40} fill="#666" opacity={0.6} />
      <text x={286} y={44} fontSize={7} fill="#f2c14e" textAnchor="middle">воля</text>
      {/* лаз */}
      <path d={`M${x0},${y0} V${yb}${side > 0 ? ` H${xe}` : ''}`} stroke="#1a0e08" strokeWidth={12} strokeLinecap="round" fill="none" />
      <path d={`M${x0},${y0} V${yb}${side > 0 ? ` H${xe}` : ''}`} stroke="#8a6a3a" strokeWidth={1} strokeDasharray="2 6" fill="none" />
      {/* копатель в забое */}
      {!done && depth > 0 && (
        <g transform={`translate(${side > 0 ? xe : x0} ${yb})`}>
          <g className={digging ? 'tun-dig' : ''}>
            <circle r={4} fill="#d0a880" />
            <path d="M3,0 l6,-4" stroke="#aaa" strokeWidth={1.4} />
          </g>
        </g>
      )}
      <text x={150} y={164} fontSize={10} textAnchor="middle" fill="#f2e6c8" fontWeight="bold">
        {done ? 'Ушёл!' : `${depth} / ${TUNNEL.goal} м`}
      </text>
    </svg>
  );
}
