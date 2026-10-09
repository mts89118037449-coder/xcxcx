import { useState } from 'react';
import { COURT, COURT_ARGS, courtChance } from '../shared/court.ts';
import { useGame } from './game.tsx';

/** Апелляция в профиле: собрать доводы и пойти на заседание. Раз за ходку. */
export function CourtCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < COURT.minLevel) return null;
  const a = p.appeal;
  const chance = courtChance(a.args);
  return (
    <>
      <button className={`court-card ${a.done ? (a.won ? 'won' : 'lost') : ''}`} onClick={() => setOpen(true)}>
        <span className="court-ico">⚖️</span>
        <span className="grow">
          <b>Апелляция</b>
          <small>
            {a.done
              ? a.won
                ? `скостили ${-a.delta} дн.`
                : `отказ, +${a.delta} дн.`
              : `доводов ${a.args.length} · шанс ${chance}%`}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <CourtModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CourtModal({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [bang, setBang] = useState(0);
  const a = p.appeal;
  const chance = courtChance(a.args);
  const hearing = async () => {
    setBang((b) => b + 1);
    await new Promise((r) => setTimeout(r, 1300));
    const r = await act<{ won: boolean; delta: number }>('courtHearing');
    if (r) toast(r.won ? `⚖️ Удовлетворено! −${-r.delta} дн.` : `⚖️ Отказ. Добавили ${r.delta} дн.`, r.won ? undefined : 'err');
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <Courtroom bang={bang} verdict={a.done ? (a.won ? 'won' : 'lost') : null} />
        {a.done ? (
          <div className={`court-verdict ${a.won ? 'won' : 'lost'}`}>
            {a.won ? `Суд скостил ${-a.delta} дн. срока` : `В апелляции отказано, добавили ${a.delta} дн.`}
            <small>Следующая апелляция — в новую ходку</small>
          </div>
        ) : (
          <>
            <div className="court-meter">
              <i style={{ width: `${chance}%` }} />
              <em>шанс {chance}%</em>
            </div>
            <div className="muted small center">
              Удача: −{COURT.cut[0]}–{COURT.cut[1]}% оставшегося срока. Провал: +{COURT.add}% срока ходки.
            </div>
            <div className="court-args">
              {COURT_ARGS.map((g) => {
                const have = a.args.includes(g.id);
                return (
                  <button key={g.id} className={`court-arg ${have ? 'have' : ''}`} disabled={busy || have} onClick={() => act('courtArg', { id: g.id })}>
                    <span className="court-em">{g.emoji}</span>
                    <b>{g.name}</b>
                    <small>{have ? 'в деле ✓' : g.need}</small>
                    <i>+{g.pct}%</i>
                  </button>
                );
              })}
            </div>
            <button className="btn btn-wide" disabled={busy || bang > 0 || p.term < COURT.minTerm} onClick={hearing}>
              {p.term < COURT.minTerm ? 'Срок и так почти вышел' : `🔨 На заседание · ${chance}%`}
            </button>
          </>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Зал суда: судья за кафедрой, герб, решётка подсудимого; молоток стучит перед приговором. */
function Courtroom({ bang, verdict }: { bang: number; verdict: 'won' | 'lost' | null }) {
  return (
    <svg className="court-art" viewBox="0 0 240 130">
      <rect width={240} height={130} fill="#3a2a22" />
      <rect y={100} width={240} height={30} fill="#2a1e18" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={i * 42} y={0} width={4} height={100} fill="#2e2018" />
      ))}
      {/* герб */}
      <circle cx={120} cy={22} r={12} fill="#c9a040" stroke="#7a5a1a" />
      <path d="M120,13 L123,20 L130,20 L124,24 L126,31 L120,27 L114,31 L116,24 L110,20 L117,20 Z" fill="#8a1a1a" />
      {/* судья */}
      <circle cx={120} cy={52} r={9} fill="#e0b896" />
      <path d="M111,48 Q120,38 129,48" fill="#ddd" />
      <path d="M104,76 Q104,62 120,61 Q136,62 136,76 Z" fill="#141414" />
      <path d="M116,62 L120,70 L124,62" fill="#fff" />
      {/* кафедра */}
      <rect x={70} y={72} width={100} height={30} fill="#6a3a1e" stroke="#3a1e0e" />
      <rect x={70} y={70} width={100} height={4} fill="#8a4e28" />
      {/* молоток */}
      <g key={bang} className={bang ? 'gavel bang' : 'gavel'} transform="translate(150 66)">
        <rect x={-2} y={-2} width={16} height={3} rx={1} fill="#4a2a10" transform="rotate(-30)" />
        <rect x={10} y={-12} width={7} height={11} rx={1.5} fill="#5a3418" transform="rotate(-30)" />
      </g>
      {/* скамья подсудимого */}
      <path d="M8,100 V64 H58 V100 M14,64 V100 M22,64 V100 M30,64 V100 M38,64 V100 M46,64 V100 M52,64 V100" stroke="#888" strokeWidth={1.4} fill="none" />
      <circle cx={33} cy={78} r={7} fill="#c9a07a" />
      <path d="M24,100 Q24,86 33,86 Q42,86 42,100 Z" fill="#333" />
      {/* конвой */}
      <rect x={196} y={64} width={14} height={36} rx={5} fill="#3a4a3a" />
      <circle cx={203} cy={58} r={6} fill="#d0a880" />
      <rect x={196} y={50} width={14} height={4} fill="#2a3a2a" />
      {verdict && (
        <text x={120} y={120} fontSize={13} textAnchor="middle" fontWeight="bold" fill={verdict === 'won' ? '#7ae04a' : '#e04a3a'}>
          {verdict === 'won' ? 'УДОВЛЕТВОРИТЬ' : 'ОТКАЗАТЬ'}
        </text>
      )}
    </svg>
  );
}
