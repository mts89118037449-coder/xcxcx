import { useEffect, useState } from 'react';
import { RIOT } from '../shared/riot.ts';
import { api } from './api.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

type Live = Awaited<ReturnType<typeof api.riot>>;

/** Бунт на экране «Зона»: позвать, проголосовать, драться, забрать награду. */
export function RiotCard() {
  const { p, now, act, busy, toast } = useGame();
  const [open, setOpen] = useState(false);
  const r = p.riot;
  if (r.phase === 'idle' || (r.phase === 'won' && !r.canClaim)) {
    if (!r.canCall || p.level < RIOT.minLevel) return null;
    return (
      <button className="riot-call" disabled={busy || p.butts < RIOT.callButts} onClick={() => confirm('Подбить зону на бунт? Сутки голосуют все.') && act('riotCall').then((x) => x && toast('🔥 Агитация пошла — зона голосует'))}>
        🔥 Подбить зону на бунт · {RIOT.callButts} 🚬
      </button>
    );
  }
  if (r.phase === 'lost')
    return (
      <div className="riot-banner lost">
        <b>⛓️ Бунт подавлен — гайки закручены</b>
        <small>
          смены платят {Math.round(RIOT.penaltyJob * 100)}% ещё {timeLeft(r.endsAt - now)}
        </small>
      </div>
    );
  if (r.phase === 'won')
    return (
      <div className="riot-banner won">
        <b>🔥 Бунт удался! Администрация пошла на уступки</b>
        <button className="btn" disabled={busy} onClick={() => act('riotClaim').then((x) => x && toast(`+${RIOT.reward.gold} 🪙 +${RIOT.reward.authority} 🎖️ · титул «Бунтарь»`))}>
          Забрать: {RIOT.reward.gold} 🪙 · {RIOT.reward.authority} 🎖️ · титул
        </button>
      </div>
    );
  if (r.phase === 'vote') {
    const total = Math.max(1, r.yes + r.no);
    return (
      <div className="riot-banner vote">
        <b>🔥 {r.by} подбивает зону на бунт</b>
        <small>
          голосование ещё {timeLeft(r.endsAt - now)} · нужно от {RIOT.minVotes} голосов и большинство «за»
        </small>
        <div className="riot-votebar">
          <i style={{ width: `${(r.yes / total) * 100}%` }} />
          <span>✊ {r.yes}</span>
          <span>🙅 {r.no}</span>
        </div>
        {r.myVote === null ? (
          <div className="row gap-s">
            <button className="btn btn-red grow" disabled={busy} onClick={() => act('riotVote', { yes: true })}>
              ✊ За бунт
            </button>
            <button className="btn btn-dark grow" disabled={busy} onClick={() => act('riotVote', { yes: false })}>
              🙅 Против
            </button>
          </div>
        ) : (
          <small>Ты {r.myVote ? 'за бунт' : 'против'}</small>
        )}
      </div>
    );
  }
  const w = RIOT.waves[r.wave];
  return (
    <>
      <button className="riot-banner fight" onClick={() => setOpen(true)}>
        <b>
          🔥 БУНТ! Волна {r.wave + 1}/3: {w.emoji} {w.name}
        </b>
        <span className="riot-hp">
          <i style={{ width: `${(r.hp / r.max) * 100}%` }} />
        </span>
        <small>осталось {timeLeft(r.endsAt - now)} · тапни — в бой</small>
      </button>
      {open && <RiotFight onClose={() => setOpen(false)} />}
    </>
  );
}

function RiotFight({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const [live, setLive] = useState<Live | null>(null);
  const [pops, setPops] = useState<{ id: number; dmg: number; crit: boolean }[]>([]);
  useEffect(() => {
    const load = () => api.riot().then(setLive).catch(() => null);
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);
  const r = live?.riot ?? p.riot;
  const cd = r.hitAt + RIOT.hitCdSec * 1000 - now;
  const hit = async () => {
    const x = await act<{ dmg: number; crit: boolean; next: string | null }>('riotHit');
    if (!x) return;
    setPops((a) => [...a.slice(-4), { id: Date.now(), dmg: x.dmg, crit: x.crit }]);
    if (x.next === 'wave') toast('💥 Волна сломлена! Идёт следующая');
    if (x.next === 'won') toast('🔥 Бунт удался!');
    api.riot().then(setLive).catch(() => null);
  };
  const w = RIOT.waves[Math.min(r.wave, RIOT.waves.length - 1)];
  const frac = r.max ? r.hp / r.max : 0;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h3 className="center">
          🔥 Бунт · волна {Math.min(r.wave + 1, 3)}/3
        </h3>
        <div className="riot-scene">
          <RiotArt frac={frac} wave={r.wave} />
          {pops.map((x) => (
            <span key={x.id} className={`riot-pop ${x.crit ? 'crit' : ''}`}>
              −{fmt(x.dmg)}
            </span>
          ))}
        </div>
        <div className="riot-hp big">
          <i style={{ width: `${frac * 100}%` }} />
          <em>
            {w.emoji} {w.name}: {fmt(r.hp)} / {fmt(r.max)}
          </em>
        </div>
        <button className="btn btn-wide btn-red" disabled={busy || r.phase !== 'fight' || cd > 0 || p.energy < RIOT.hitEnergy} onClick={hit}>
          {r.phase !== 'fight' ? 'Бой окончен' : cd > 0 ? `Отдышись ${Math.ceil(cd / 1000)} с` : `👊 Ударить · ${RIOT.hitEnergy} ⚡`}
        </button>
        <div className="riot-feed">
          <small className="muted">твой урон: {fmt(r.myDmg)}</small>
          {live?.top.map((t, i) => (
            <div key={t.id} className={t.id === p.id ? 'me' : ''}>
              {['🥇', '🥈', '🥉', '4.', '5.'][i]} {t.name} <b>{fmt(t.dmg)}</b>
            </div>
          ))}
          {live?.feed.slice(0, 4).map((f, i) => (
            <small key={i} className="riot-feed-line">
              👊 {f.name} −{fmt(f.dmg)}
            </small>
          ))}
        </div>
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Двор в огне: бочки горят, слева зэки, справа стена щитов — чем меньше здоровья у волны, тем меньше щитов. */
function RiotArt({ frac, wave }: { frac: number; wave: number }) {
  const shields = Math.max(0, Math.ceil(frac * 7));
  const color = ['#3a4a5a', '#2a3a2a', '#1a1a1a'][Math.min(wave, 2)];
  return (
    <svg viewBox="0 0 300 150" className="riot-art">
      <rect width={300} height={150} fill="#2a2228" />
      <rect y={100} width={300} height={50} fill="#4a4440" />
      <path d="M0,40 H300" stroke="#888" strokeWidth={1} strokeDasharray="3 3" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${i * 100},38 q25,-6 50,0 q25,6 50,0`} stroke="#aaa" fill="none" />
      ))}
      {/* дым */}
      <circle className="riot-smoke" cx={70} cy={50} r={16} fill="#555" opacity={0.4} />
      <circle className="riot-smoke s2" cx={150} cy={40} r={20} fill="#555" opacity={0.3} />
      {/* бочки с огнём */}
      {[60, 150].map((x) => (
        <g key={x} transform={`translate(${x} 92)`}>
          <rect x={-9} y={0} width={18} height={20} fill="#5a3a2a" stroke="#2a1a10" />
          <path className="riot-fire" d="M-8,0 Q-6,-14 0,-20 Q2,-10 6,-16 Q9,-6 8,0 Z" fill="#f08a2a" />
          <path className="riot-fire f2" d="M-4,0 Q-2,-9 1,-12 Q3,-6 4,0 Z" fill="#ffd040" />
        </g>
      ))}
      {/* зэки */}
      {[20, 40, 95, 118].map((x, i) => (
        <g key={x} transform={`translate(${x} 104)`}>
          <g className={`riot-man m${i}`}>
          <circle cy={-22} r={5} fill="#d0a880" />
          <rect x={-5} y={-17} width={10} height={16} fill={i % 2 ? '#2a2a3a' : '#5a5a6a'} />
          <path d="M-5,-12 l-6,-10 M5,-12 l6,-10" stroke="#d0a880" strokeWidth={2} />
          <path d="M-3,-1 v10 M3,-1 v10" stroke="#222" strokeWidth={2.5} />
          </g>
        </g>
      ))}
      {/* стена щитов */}
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i} transform={`translate(${190 + i * 15} ${86 + (i % 2) * 3})`} opacity={i < shields ? 1 : 0.12}>
          <circle cy={-6} r={5} fill={color} />
          <rect x={-7} y={-1} width={14} height={26} rx={2} fill="#9ab0c0" stroke="#4a5a6a" opacity={0.85} />
          <path d="M-4,6 h8" stroke="#2a3a4a" />
        </g>
      ))}
    </svg>
  );
}
