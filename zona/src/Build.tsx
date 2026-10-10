import { ModalHead } from './Nav.tsx';
import { useEffect, useState } from 'react';
import { BUILD, BUILDINGS } from '../shared/build.ts';
import { MATS } from '../shared/craft.ts';
import { api } from './api.ts';
import { fmt, useGame } from './game.tsx';

/** Стройка зоны: полоска текущего здания на экране «Зона». */
export function BuildCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const z = p.zoneBuild;
  const cur = BUILDINGS[z.idx];
  return (
    <>
      <button className="build-card" onClick={() => setOpen(true)}>
        <span className="build-row">
          {BUILDINGS.map((b, i) => (
            <span key={b.id} className={`build-dot ${z.done.includes(b.id) ? 'done' : i === z.idx ? 'cur' : ''}`}>
              {b.emoji}
            </span>
          ))}
        </span>
        {cur ? (
          <>
            <span className="build-title">
              🏗️ Строим: <b>{cur.name}</b> <small>{cur.text}</small>
            </span>
            <span className="build-bar">
              <i style={{ width: `${(z.pts / cur.goal) * 100}%` }} />
              <em>
                {fmt(z.pts)} / {fmt(cur.goal)}
              </em>
            </span>
          </>
        ) : (
          <span className="build-title">🏁 Зона отстроена целиком</span>
        )}
      </button>
      {open && <BuildModal onClose={() => setOpen(false)} />}
    </>
  );
}

function BuildModal({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [top, setTop] = useState<{ id: number; name: string; pts: number }[]>([]);
  const z = p.zoneBuild;
  const cur = BUILDINGS[z.idx];
  const load = () => api.build().then((r) => setTop(r.top)).catch(() => null);
  useEffect(() => {
    load();
  }, []);
  const give = async (kind: 'money' | 'mat', ref: string, qty: number) => {
    const r = await act<{ pts: number; authority: number; title: boolean; finished: string[] }>('buildGive', { kind, ref, qty });
    if (!r) return;
    const fin = r.finished.map((id) => BUILDINGS.find((b) => b.id === id)!);
    toast(fin.length ? `🎉 Достроили: ${fin.map((b) => `${b.emoji} ${b.name}`).join(', ')}!` : `🧱 +${fmt(r.pts)} в стройку${r.authority ? ` · 🎖️+${r.authority}` : ''}${r.title ? ' · титул «Прораб зоны»!' : ''}`);
    load();
  };
  const frac = cur ? z.pts / cur.goal : 1;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <h3 className="center">🏗️ Стройка зоны</h3>
        {cur && <BuildArt emoji={cur.emoji} frac={frac} />}
        <div className="build-list">
          {BUILDINGS.map((b, i) => {
            const done = z.done.includes(b.id);
            return (
              <div key={b.id} className={`build-item ${done ? 'done' : i === z.idx ? 'cur' : 'lock'}`}>
                <span className="build-em">{b.emoji}</span>
                <span className="grow">
                  <b>{b.name}</b>
                  <small>{b.text} всей зоне</small>
                  {i === z.idx && (
                    <span className="build-bar">
                      <i style={{ width: `${frac * 100}%` }} />
                      <em>{Math.floor(frac * 100)}%</em>
                    </span>
                  )}
                </span>
                <span>{done ? '✅' : i === z.idx ? '🔨' : '🔒'}</span>
              </div>
            );
          })}
        </div>
        {cur && (
          <>
            <div className="muted small center">Вложить: деньги 1 ₽ = 1 очко, материал = {BUILD.matPts} очков. За каждые {fmt(BUILD.authorityPer)} очков — 🎖️ авторитет.</div>
            <div className="row gap-s">
              {BUILD.money.map((m) => (
                <button key={m} className="btn btn-dark grow" disabled={busy || p.money < m} onClick={() => give('money', '', m)}>
                  {fmt(m)} ₽
                </button>
              ))}
            </div>
            <div className="build-mats">
              {MATS.map((m) => {
                const have = p.mats[m.id] ?? 0;
                return (
                  <button key={m.id} className="btn btn-dark" disabled={busy || have < 1} onClick={() => give('mat', m.id, have >= 5 ? 5 : have)}>
                    {m.emoji} {have}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="build-top">
          <b>👷 Прорабы зоны · ты вложил {fmt(p.built)}</b>
          {top.map((r, i) => (
            <div key={r.id} className={r.id === p.id ? 'me' : ''}>
              <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span> {r.name} <b>{fmt(r.pts)}</b>
            </div>
          ))}
        </div>
        <button className="btn btn-wide" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Леса и кирпичи: чем ближе к концу, тем выше стены. */
function BuildArt({ emoji, frac }: { emoji: string; frac: number }) {
  const rows = 8;
  const built = Math.round(frac * rows);
  return (
    <svg className="build-art" viewBox="0 0 200 110">
      <rect width={200} height={110} fill="#2a2a30" />
      <rect y={92} width={200} height={18} fill="#4a4036" />
      {/* кран */}
      <path d="M168,92 V14 M150,14 H196 M168,14 L150,30 M168,22 L186,14" stroke="#e0a030" strokeWidth={2.4} fill="none" />
      <path className="crane-hook" d="M156,14 V40" stroke="#888" strokeWidth={0.8} />
      <rect className="crane-hook" x={150} y={40} width={12} height={6} fill="#a8463a" />
      {/* стены из кирпичей */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: 10 }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={40 + c * 10 + (r % 2 ? 5 : 0)}
            y={84 - r * 8}
            width={9.4}
            height={7.4}
            fill={r < built ? '#a8563a' : 'none'}
            stroke={r < built ? '#6a3020' : '#ffffff22'}
            strokeWidth={0.6}
          />
        )),
      )}
      {/* леса */}
      <path d="M36,92 V20 M146,92 V20 M36,30 H146 M36,56 H146 M36,82 H146 M36,30 L146,82" stroke="#8a6a3a" strokeWidth={1.2} fill="none" opacity={0.8} />
      <text x={95} y={20} fontSize={16} textAnchor="middle">
        {emoji}
      </text>
      <text x={95} y={104} fontSize={9} textAnchor="middle" fill="#f2c14e" fontWeight="bold">
        {Math.floor(frac * 100)}%
      </text>
    </svg>
  );
}
