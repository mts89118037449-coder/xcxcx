import { ModalHead } from './Nav.tsx';
import { babble } from './sound.ts';
import { useEffect, useState } from 'react';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { COURT, COURT_ARGS, courtChance } from '../shared/court.ts';
import { lookOf, useGame } from './game.tsx';

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
        <ModalHead onClose={onClose} />
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

const COURT_LINES: [string, string][] = [
  ['Прокурор', 'Требую максимальный срок! За что — уточним в процессе.'],
  ['Адвокат', 'Мой подзащитный… э-э… простите, а за что он сидит?'],
  ['Судья', 'Хрр… Протест отклонён… хрр…'],
  ['Прокурор', 'Посмотрите на это лицо! Это лицо рецидивиста!'],
  ['Адвокат', 'Ваша честь, он хороший. Мама так говорит.'],
  ['Судья', 'Кто-нибудь, разбудите меня к приговору.'],
];

/** Зал суда: спящий судья, прокурор тычет пальцем, адвокат-неудачник чешет затылок. Молоток — перед приговором. */
function Courtroom({ bang, verdict }: { bang: number; verdict: 'won' | 'lost' | null }) {
  const { p } = useGame();
  const judge = useNpc('sheet/cast/oldman');
  const pros = useNpc('sheet/boss/b_prosecutor');
  const law = useNpc('sheet/cast/lawyer');
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (verdict || bang) return;
    const t = setInterval(() => setLine((l) => (l + 1) % COURT_LINES.length), 3200);
    return () => clearInterval(t);
  }, [verdict, bang]);
  const [who, text] = COURT_LINES[line];
  useEffect(() => {
    if (!verdict && !bang) babble(text, who === 'Судья' ? 'судья' : who);
  }, [line]);
  const speaking = !verdict && !bang ? who : null;
  const judgeAnim = bang || verdict ? 'talk' : 'sad';
  const prosAnim = verdict === 'won' ? 'sad' : verdict === 'lost' ? 'proud' : speaking === 'Прокурор' ? 'talk' : 'crossed';
  const lawAnim = verdict === 'won' ? 'dance' : verdict === 'lost' ? 'shrug' : speaking === 'Адвокат' ? 'talk' : 'scratch';
  const heroAnim = verdict === 'won' ? 'cheer' : verdict === 'lost' ? 'sad' : 'idle';
  return (
    <div className="court-wrap">
      <svg className="court-art" viewBox="0 0 300 170">
        <rect width={300} height={170} fill="#8a5a3a" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={i * 46 + 6} y={0} width={8} height={130} fill="#7a4a2e" stroke="#1a1410" strokeWidth={1.4} />)}
        <rect y={128} width={300} height={42} fill="#5a3a24" stroke="#1a1410" strokeWidth={2} />
        <circle cx={150} cy={20} r={13} fill="#ffc83a" stroke="#1a1410" strokeWidth={2} />
        <path d="M150,10 L153,17 L160,17 L154,21 L156,28 L150,24 L144,28 L146,21 L140,17 L147,17 Z" fill="#c0302a" />
        {/* судья за кафедрой */}
        {judge && (
          <Place x={150} y={140} scale={0.42}>
            <ImageG url={judge.url} height={judge.height} anim={judgeAnim} />
          </Place>
        )}
        <rect x={108} y={96} width={84} height={40} fill="#6a3a1e" stroke="#1a1410" strokeWidth={2.4} />
        <rect x={104} y={92} width={92} height={7} fill="#8a4e28" stroke="#1a1410" strokeWidth={2} />
        {!bang && !verdict && (
          <text x={176} y={56} fontSize={11} fontWeight={900} fill="#fff" stroke="#1a1410" strokeWidth={0.6} className="court-zzz">
            Z z z
          </text>
        )}
        <g key={bang} className={bang ? 'gavel bang' : 'gavel'} transform="translate(178 90)">
          <rect x={-2} y={-2} width={18} height={4} rx={1} fill="#4a2a10" stroke="#1a1410" strokeWidth={1} transform="rotate(-30)" />
          <rect x={12} y={-13} width={8} height={12} rx={1.5} fill="#5a3418" stroke="#1a1410" strokeWidth={1} transform="rotate(-30)" />
        </g>
        {/* прокурор и адвокат */}
        {pros && (
          <Place x={250} y={166} scale={0.5}>
            <ImageG url={pros.url} height={pros.height} anim={prosAnim} mirror hold="papers" />
          </Place>
        )}
        {law && (
          <Place x={86} y={166} scale={0.48}>
            <ImageG url={law.url} height={law.height} anim={lawAnim} />
          </Place>
        )}
        {/* подсудимый в клетке */}
        <Place x={30} y={164} scale={0.44}>
          <PoseG name="stand" look={lookOf(p)} anim={heroAnim} startKey={verdict ?? 'n'} />
        </Place>
        <rect x={6} y={80} width={50} height={86} fill="none" stroke="#1a1410" strokeWidth={2} />
        {[14, 22, 30, 38, 46].map((x) => <path key={x} d={`M${x},80 V166`} stroke="#5a5a62" strokeWidth={2} />)}
      </svg>
      {speaking && (
        <div className="court-say" key={line}>
          <b>{who}:</b> {text}
        </div>
      )}
    </div>
  );
}
