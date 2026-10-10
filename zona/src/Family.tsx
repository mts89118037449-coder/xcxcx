import { useState } from 'react';
import { FAMILY, FAMILY_ROUNDS, FAMILY_WHO, type FamOutcome } from '../shared/family.ts';
import { consumableById } from '../shared/perks.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

/** Свиданка с роднёй в профиле. */
export function FamilyCard() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < FAMILY.minLevel) return null;
  const f = p.family;
  const who = FAMILY_WHO[f.who];
  const buff = f.buffUntil > now;
  return (
    <>
      <button className={`pen-card fam-card ${!f.done ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">{who.emoji}</span>
        <span className="grow">
          <b>Свиданка с роднёй</b>
          <small>{!f.done ? `${who.name} приехала — ждёт в комнате свиданий` : buff ? `💛 +${f.buffPct}% со смен ещё ${timeLeft(f.buffUntil - now)}` : `следующая через ${timeLeft(f.nextAt - now)}`}</small>
        </span>
        <i>▸</i>
      </button>
      {open && <FamilyModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FamilyModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy } = useGame();
  const [end, setEnd] = useState<(FamOutcome & { money: number; items: string[] }) | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const f = p.family;
  const who = FAMILY_WHO[f.who];
  const step = f.picks.length;
  const round = !f.done ? FAMILY_ROUNDS[f.who][f.rounds[step]] : null;
  const answer = async (i: number) => {
    setSaid(round!.options[i].text);
    const r = await act<{ mood: number; end: (FamOutcome & { money: number; items: string[] }) | null }>('familyTalk', { choice: i });
    if (r?.end) setEnd(r.end);
    setTimeout(() => setSaid(null), 900);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <VisitRoom who={f.who} mood={f.mood} line={end ? null : round ? (step === 0 && !said ? `${who.hello} ${round.line}` : round.line) : null} said={said} done={f.done} />
        {round && !end && (
          <div className="pen-choices">
            {round.options.map((o, i) => (
              <button key={i} className="btn btn-dark" disabled={busy || !!said} onClick={() => answer(i)}>
                {o.text}
              </button>
            ))}
            <div className="fam-steps">
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < step ? 'on' : i === step ? 'cur' : ''} />
              ))}
            </div>
          </div>
        )}
        {end && (
          <div className="fam-end">
            <b>{end.title}</b>
            <small>{end.text}</small>
            <div className="fam-gifts">
              {end.butts > 0 && <span>🚬 {end.butts}</span>}
              {end.money > 0 && <span>{fmt(end.money)} ₽</span>}
              {end.items.map((id, i) => (
                <span key={i}>{consumableById.get(id)?.emoji ?? '🎁'}</span>
              ))}
              {end.buffPct > 0 && <span className="buff">💛 +{end.buffPct}% опыта и денег со смен на сутки</span>}
            </div>
          </div>
        )}
        {f.done && !end && (
          <div className="fam-end">
            <b>На этой неделе уже виделись</b>
            <small>Следующая свиданка через {timeLeft(f.nextAt - now)}</small>
          </div>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Комната длительных свиданий: обои, окно с решёткой, стол с чаем. Гость напротив, с пузырём реплики. */
function VisitRoom({ who, mood, line, said, done }: { who: 'mom' | 'wife'; mood: number; line: string | null; said: string | null; done: boolean }) {
  const happy = mood >= 2;
  const sad = mood < 0;
  return (
    <div className="fam-room">
      <svg viewBox="0 0 300 180">
        <rect width={300} height={180} fill="#6a5a4a" />
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d={`M${i * 20},0 V130`} stroke="#7a6a56" strokeWidth={8} opacity={0.5} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={10 + i * 20} cy={30 + (i % 2) * 40} r={2.4} fill="#a08a6a" />
        ))}
        {/* окно с решёткой */}
        <rect x={210} y={20} width={64} height={56} fill="#9ec4e0" stroke="#3a2a1a" strokeWidth={3} />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={216 + k * 16} y={20} width={3} height={56} fill="#333" />
        ))}
        <path d="M214,22 Q226,40 214,74" fill="#c0505a" opacity={0.7} />
        {/* занавеска и коврик */}
        <rect y={130} width={300} height={50} fill="#5a3a2a" />
        <ellipse cx={150} cy={160} rx={110} ry={16} fill="#8a3a3a" opacity={0.5} />
        {/* гостья */}
        <g transform="translate(150 60)">
        <g className={`fam-guest ${happy ? 'happy' : sad ? 'sad' : ''}`}>
          {who === 'mom' ? (
            <>
              <path d="M-32,70 Q-34,22 0,20 Q34,22 32,70 Z" fill="#6a4a7a" />
              <path d="M-10,22 L0,40 L10,22" fill="#e8d8c0" />
              <circle cx={0} cy={0} r={17} fill="#e8c4a0" />
              <path d="M-20,2 Q-22,-24 0,-24 Q22,-24 20,2 Q16,-14 0,-14 Q-16,-14 -20,2 Z" fill="#c0303a" />
              <path d="M-18,4 L-24,20 L-12,10 Z M18,4 L24,20 L12,10 Z" fill="#c0303a" />
              <circle cx={-6} cy={0} r={1.6} fill="#333" />
              <circle cx={6} cy={0} r={1.6} fill="#333" />
              <path d="M-8,-4 h5 M3,-4 h5" stroke="#8a6a5a" strokeWidth={0.8} />
            </>
          ) : (
            <>
              <path d="M-30,70 Q-32,22 0,20 Q32,22 30,70 Z" fill="#3a6a9a" />
              <path d="M-22,6 Q-26,-26 0,-24 Q26,-26 22,6 L24,30 L14,10 Q0,-12 -14,10 L-24,30 Z" fill="#6a3a1a" />
              <circle cx={0} cy={0} r={16} fill="#f0cca8" />
              <path d="M-16,-6 Q0,-22 16,-6 Q8,-14 -16,-6 Z" fill="#6a3a1a" />
              <circle cx={-6} cy={0} r={1.6} fill="#333" />
              <circle cx={6} cy={0} r={1.6} fill="#333" />
              <circle cx={-9} cy={5} r={2.4} fill="#f0a0a0" opacity={0.6} />
              <circle cx={9} cy={5} r={2.4} fill="#f0a0a0" opacity={0.6} />
            </>
          )}
          <path d={happy ? 'M-6,8 Q0,13 6,8' : sad ? 'M-6,11 Q0,6 6,11' : 'M-5,9 H5'} stroke="#7a3a2a" strokeWidth={1.4} fill="none" />
          {sad && <path className="fam-tear" d="M-7,3 q-1,4 0,6 q1,-2 0,-6 Z" fill="#7ac0f0" />}
        </g>
        </g>
        {/* стол с чаем и пирожками */}
        <rect x={60} y={118} width={180} height={12} fill="#8a5a2a" />
        <rect x={70} y={130} width={8} height={40} fill="#6a4020" />
        <rect x={222} y={130} width={8} height={40} fill="#6a4020" />
        <ellipse cx={150} cy={116} rx={70} ry={5} fill="#f0f0e8" />
        <rect x={100} y={102} width={12} height={14} rx={2} fill="#e8e0d0" />
        <path className="steam" d="M106,100 Q102,92 106,86" stroke="#fff" strokeWidth={1.4} fill="none" opacity={0.5} />
        <rect x={188} y={102} width={12} height={14} rx={2} fill="#e8e0d0" />
        <ellipse cx={150} cy={111} rx={20} ry={5} fill="#d0a060" />
        <ellipse cx={144} cy={107} rx={6} ry={3} fill="#c08040" />
        <ellipse cx={156} cy={107} rx={6} ry={3} fill="#c08040" />
        {done && <text x={150} y={170} fontSize={12} textAnchor="middle" fill="#f2e6c8">{happy ? '💛' : sad ? '💧' : '🤝'}</text>}
      </svg>
      {line && <div className="fam-bubble them">{line}</div>}
      {said && <div className="fam-bubble me">{said}</div>}
    </div>
  );
}
