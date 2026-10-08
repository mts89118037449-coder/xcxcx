// Фирменные приёмы боссов: что летит, кто бежит и как называется удар. Только картинка — урон считает сервер.

export type MoveFx = 'stool' | 'papers' | 'syringe' | 'cards' | 'dog' | 'swing' | 'stab' | 'shield';

export interface BossMove {
  fx: MoveFx;
  /** название фирменного удара — всплывает при ударе и в представлении */
  name: string;
  /** реплика на выходе */
  intro: string;
}

export const BOSS_MOVES: Record<string, BossMove> = {
  b_rat: { fx: 'stab', name: 'Ложкой в бок', intro: 'Крутит заточенную ложку и скалится' },
  b_pickpocket: { fx: 'stab', name: 'Ловкость рук', intro: '«Чё такой напряжённый? Карманы проверь»' },
  b_guard: { fx: 'swing', name: 'Дубинал', intro: 'Постукивает дубинкой по ладони' },
  b_zavhoz: { fx: 'swing', name: 'Трубой по спине', intro: 'Выходит со склада с куском трубы' },
  b_chief: { fx: 'swing', name: 'Кувалдой по хребту', intro: '«Строиться!» — и сразу бьёт' },
  b_dog: { fx: 'dog', name: 'Джульбарс, фас!', intro: 'Овчарка рвётся с поводка' },
  b_snitch: { fx: 'stab', name: 'Удар в спину', intro: 'Заходит сбоку, глаза бегают' },
  b_medic: { fx: 'syringe', name: 'Укол успокоительного', intro: 'Пощёлкивает шприцем: «Сейчас будет не больно»' },
  b_warden: { fx: 'stool', name: 'Табуреткой', intro: 'Берёт табуретку: «Ну, кто тут смелый?»' },
  b_kum: { fx: 'papers', name: 'Папкой с делом', intro: '«Я про тебя всё знаю» — и раскрывает папку' },
  b_smotr: { fx: 'cards', name: 'Колода в лицо', intro: 'Тасует колоду: «Сыграем?»' },
  b_general: { fx: 'swing', name: 'Генеральский разнос', intro: 'Свита расступается — генерал в гневе' },
  b_major: { fx: 'swing', name: 'Режим есть режим', intro: 'Свисток, дубинка, протокол' },
  b_thief: { fx: 'cards', name: 'Воровской расклад', intro: 'Перстни блестят: «Ну давай, первоход»' },
  b_typhoon: { fx: 'shield', name: 'Щитом в лицо', intro: 'Щит, шлем, дубинка — спецназ пошёл' },
  b_prosecutor: { fx: 'papers', name: 'Протест прокурора', intro: 'Открывает дело и надевает очки' },
  b_lumber: { fx: 'swing', name: 'Топором с плеча', intro: '«Норму не сделал — сам ляжешь под пилу»' },
  b_frost: { fx: 'swing', name: 'Ледяной разнос', intro: 'Иней на погонах, пар изо рта' },
  b_pakhan: { fx: 'cards', name: 'Камерный расклад', intro: 'Пахан откладывает карты: «Ну, поговорим»' },
  b_korpus: { fx: 'shield', name: 'Дверью по лицу', intro: 'Звенит ключами, открывает кормушку' },
  b_sdp: { fx: 'papers', name: 'Рапорт начальству', intro: 'Достаёт блокнот: «Запишем нарушение»' },
  b_podpolkovnik: { fx: 'swing', name: 'Режим превыше всего', intro: 'Свисток, строй, «смирно»' },
};

/** То, что летит в цель: рисуется в начале координат, полёт задаёт CSS. */
function Projectile({ fx }: { fx: MoveFx }) {
  switch (fx) {
    case 'stool':
      return (
        <g>
          <rect x={-14} y={-4} width={28} height={6} rx={2} fill="#8a5a2c" stroke="#3a2210" strokeWidth={1} />
          {[-11, 0, 10].map((x) => (
            <rect key={x} x={x} y={2} width={3} height={14} fill="#6b4420" stroke="#3a2210" strokeWidth={0.6} />
          ))}
        </g>
      );
    case 'papers':
      return (
        <g>
          <rect x={-12} y={-9} width={24} height={17} rx={1} fill="#d9c58a" stroke="#6a5420" strokeWidth={1} />
          <text x={0} y={2} fontSize={6} textAnchor="middle" fill="#6a2a1a" fontWeight="bold">
            ДЕЛО
          </text>
          {[-6, 4].map((y) => (
            <rect key={y} x={-16} y={y} width={10} height={7} fill="#f2ecd8" stroke="#999" strokeWidth={0.4} transform={`rotate(${y * 3})`} />
          ))}
        </g>
      );
    case 'syringe':
      return (
        <g>
          <rect x={-10} y={-2.4} width={16} height={4.8} rx={1} fill="#dfe8ee" stroke="#556" strokeWidth={0.8} />
          <rect x={-8} y={-1.6} width={8} height={3.2} fill="#7ac0e0" />
          <path d="M6,0 L16,0" stroke="#bbb" strokeWidth={1} />
          <rect x={-14} y={-4} width={4} height={8} fill="#aab" />
        </g>
      );
    case 'cards':
      return (
        <g>
          {[-10, 0, 10].map((r, i) => (
            <g key={r} transform={`rotate(${r}) translate(${i * 4 - 4} 0)`}>
              <rect x={-5} y={-7} width={10} height={14} rx={1.4} fill="#fff" stroke="#333" strokeWidth={0.7} />
              <text x={0} y={2} fontSize={7} textAnchor="middle" fill={i === 1 ? '#c22' : '#111'}>
                {['♠', '♥', '♣'][i]}
              </text>
            </g>
          ))}
        </g>
      );
    case 'dog':
      return (
        <g transform="scale(-1.6 1.6)">
          <path d="M-22,0 C-20,-10 -8,-12 6,-10 L14,-18 L16,-12 L22,-10 L24,-4 L14,-2 L12,8 L8,8 L8,0 L-10,0 L-12,8 L-16,8 L-16,2 C-20,2 -24,6 -28,2 C-24,0 -22,-2 -22,0 Z" fill="#3a2e22" stroke="#1a120a" strokeWidth={0.8} />
          <circle cx={18} cy={-11} r={1} fill="#ff4" />
        </g>
      );
    default:
      return null;
  }
}

const THROWN: MoveFx[] = ['stool', 'papers', 'syringe', 'cards', 'dog'];

/** Эффект фирменного удара босса: бросок, пёс или росчерк удара. from → to по x, на высоте y. */
export function BossStrike({ fx, from, to }: { fx: MoveFx; from: number; to: number }) {
  if (THROWN.includes(fx)) {
    const dog = fx === 'dog';
    return (
      <g transform={`translate(${dog ? 380 : from} ${dog ? 248 : 140})`}>
        <g className={`boss-throw ${dog ? 'dog' : ''}`} style={{ ['--dx' as string]: `${(dog ? to - 380 : to - from)}px` }}>
          <g className={dog ? 'boss-dog' : 'boss-spin'}>
            <Projectile fx={fx} />
          </g>
        </g>
      </g>
    );
  }
  // ближний удар: росчерк дуги у цели (дубинка, труба, заточка, щит)
  const d = fx === 'stab' ? 'M -6,-14 L 18,6' : fx === 'shield' ? 'M 14,-30 L 14,30' : 'M 26,-34 A 40 40 0 0 0 -8,18';
  return (
    <g transform={`translate(${to} 150)`}>
      <path className="boss-swing" d={d} fill="none" stroke="#fff" strokeWidth={fx === 'shield' ? 7 : 4} strokeLinecap="round" opacity={0.85} />
    </g>
  );
}
