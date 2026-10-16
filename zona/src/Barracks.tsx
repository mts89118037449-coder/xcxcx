import { useEffect, useState } from 'react';
import { BARRACK, BARRACKS, barrackById } from '../shared/barracks.ts';
import { api } from './api.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

type Data = Awaited<ReturnType<typeof api.barracks>>;

/** Цвет флага клана — из тега, чтобы у каждого клана был свой. */
const clanColor = (tag: string) => {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 48%)`;
};

/** Карта бараков: кто держит, кто рвётся, набег своим кланом. */
export function BarracksMap() {
  const { p, now, act, busy, toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const load = () => api.barracks().then(setData).catch(() => null);
  useEffect(() => {
    load();
  }, []);
  if (!data) return null;
  const myId = p.clan?.id;
  const held = data.list.filter((b) => b.owner && b.owner.id === myId).length;
  const cur = sel ? data.list.find((b) => b.id === sel) : null;
  const def = sel ? barrackById.get(sel) : null;
  const raid = async () => {
    const r = await act<{ pts: number }>('barrackRaid', { id: sel });
    if (r) {
      toast(`⚔️ Набег: +${r.pts} влияния клану`);
      load();
    }
  };
  return (
    <div className="bar-wrap">
      <div className="bar-head">
        <b>🏚️ Бараки зоны</b>
        <small>
          {myId ? `твой клан держит ${held}/6` : 'вступи в клан, чтобы делить бараки'} · итоги через {timeLeft(data.endsAt - now)}
        </small>
      </div>
      <svg className="bar-map" viewBox="0 0 300 170">
        <rect width={300} height={170} fill="#3a3a32" />
        <path d="M0,85 H300 M150,0 V170" stroke="#4a4a40" strokeWidth={14} />
        <path d="M4,4 H296 V166 H4 Z" stroke="#8a8a8a" strokeWidth={1.5} strokeDasharray="3 2" fill="none" />
        {data.list.map((b, i) => {
          const x = 14 + (i % 3) * 96;
          const y = i < 3 ? 12 : 96;
          const own = b.owner;
          const color = own ? clanColor(own.tag) : '#666';
          const mine = own && own.id === myId;
          return (
            <g key={b.id} className={`bar-house ${sel === b.id ? 'sel' : ''}`} onClick={() => setSel(b.id)}>
              <rect x={x} y={y + 14} width={80} height={44} fill="#6a6258" stroke={mine ? '#f2c14e' : '#2a2620'} strokeWidth={mine ? 2.4 : 1} />
              <path d={`M${x - 4},${y + 16} L${x + 40},${y} L${x + 84},${y + 16} Z`} fill="#4a3a2a" />
              {[0, 1, 2, 3].map((k) => (
                <rect key={k} x={x + 8 + k * 18} y={y + 24} width={10} height={9} fill="#e8d890" opacity={0.7} />
              ))}
              <rect x={x + 34} y={y + 42} width={12} height={16} fill="#2a2018" />
              <path d={`M${x + 72},${y + 14} V${y - 8}`} stroke="#aaa" strokeWidth={1.2} />
              <path className="bar-flag" d={`M${x + 72},${y - 8} h18 l-4,5 l4,5 h-18 Z`} fill={color} />
              <text x={x + 81} y={y - 0.5} fontSize={6} textAnchor="middle" fill="#fff" fontWeight="bold">
                {own ? own.tag : '—'}
              </text>
              <text x={x + 40} y={y + 40} fontSize={9} textAnchor="middle" fill="#fff" fontWeight="bold" style={{ paintOrder: 'stroke' }} stroke="#000" strokeWidth={2}>
                {barrackById.get(b.id)!.text}
              </text>
              {b.mine > 0 && (
                <text x={x + 4} y={y + 55} fontSize={7} fill="#f2c14e">
                  ⚔{b.mine}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {cur && def && (
        <div className="bar-info">
          <b>
            {def.name} · {def.text}
          </b>
          <small>{cur.owner ? `Держит [${cur.owner.tag}] ${cur.owner.name}` : 'Ничей'} — бонус всем его людям до конца недели</small>
          <div className="bar-top">
            {cur.top.length ? (
              cur.top.map((c, i) => (
                <span key={c.id} className={c.id === myId ? 'me' : ''}>
                  {['🥇', '🥈', '🥉'][i]} [{c.tag}] {fmt(c.pts)}
                </span>
              ))
            ) : (
              <span className="muted">За следующую неделю пока никто не бьётся</span>
            )}
          </div>
          <button className="btn btn-wide" disabled={busy || !myId || p.level < BARRACK.minLevel || p.energy < BARRACK.energy} onClick={raid}>
            ⚔️ Набег · {BARRACK.energy} ⚡ (до {BARRACK.perDay} в день)
          </button>
        </div>
      )}
      {!sel && <small className="muted center">Тапни барак: кто держит и кто рвётся. Победитель недели держит барак всю следующую.</small>}
      <div className="bar-legend">
        {BARRACKS.map((b) => (
          <span key={b.id}>
            {b.emoji} {b.text}
          </span>
        ))}
      </div>
    </div>
  );
}
