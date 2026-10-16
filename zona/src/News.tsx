import { useEffect, useState } from 'react';
import { ModalHead } from './Nav.tsx';
import { NowChip } from './Chip.tsx';
import { api } from './api.ts';
import { Place } from './art/Scenes.tsx';
import { ImageG, useNpc } from './art/sprites.tsx';
import { babble } from './sound.ts';
import { WeeklyComic } from './Comic.tsx';

type Paper = Awaited<ReturnType<typeof api.paper>>;

/** Ведущий добавляет к каждой новости свою реплику. */
const QUIPS = [
  'Наш корреспондент на месте событий. Его, правда, тоже задержали.',
  'Администрация от комментариев отказалась. И от нас тоже.',
  'Пострадавших нет. Довольных — тоже.',
  'Следим за развитием событий. Больше нам тут заняться нечем.',
  'Подробности — после отбоя. Шёпотом.',
  'Свидетели просили не называть их имён. И номеров камер.',
];

function headlines(v: Paper): string[] {
  const out: string[] = [];
  for (const c of v.chron.slice(0, 4)) out.push(`${c.emoji} ${c.text}.`);
  if (v.fighters[0]) out.push(`🥊 Лучший боец недели — ${v.fighters[0].name}: ${v.fighters[0].pts} очков. Соседи по хате просят сменить им хату.`);
  if (v.build) out.push(`${v.build.emoji} Стройка «${v.build.name}» готова на ${v.build.pct}%. Сроки, как и у всех здесь, — условные.`);
  out.push(`${v.weather.emoji} Погода: ${v.weather.label}, ${v.weather.temp}°. Синоптики советуют не выходить. Вы и не выйдете.`);
  if (v.smotr) out.push(`👁️ Смотрящий ${v.smotr.name} напоминает: общак — дело добровольное. Строго добровольное.`);
  if (out.length < 3) out.push('📢 На зоне тихо. Подозрительно тихо. Кум уже нервничает.');
  return out;
}

const SEEN = 'zona:news';
const today = () => new Date().toISOString().slice(0, 10);

/** Плашка «Новости» в ленте «сейчас важно»: горит раз в день. */
export function NewsChip() {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(() => {
    try {
      return localStorage.getItem(SEEN) !== today();
    } catch {
      return false;
    }
  });
  const show = () => {
    setOpen(true);
    setFresh(false);
    try {
      localStorage.setItem(SEEN, today());
    } catch {
      /* приватный режим */
    }
  };
  return (
    <>
      <NowChip icon="📺" label="Новости" sub="тюремный эфир" hot={fresh} onClick={show} />
      {open && <NewsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewsModal({ onClose }: { onClose(): void }) {
  const [v, setV] = useState<Paper | null>(null);
  const [i, setI] = useState(0);
  const [comic, setComic] = useState(false);
  const anchor = useNpc('sheet/cast/lawyer');
  useEffect(() => {
    api.paper().then(setV).catch(() => null);
  }, []);
  const list = v ? headlines(v) : [];
  const text = list[i] ? `${list[i]} ${QUIPS[i % QUIPS.length]}` : 'Эфир загружается… Антенну держит дед.';
  useEffect(() => {
    if (v) babble(text, 'Ведущий');
  }, [i, v]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="📺 Тюремные новости" />
        <div className="tv">
          <div className="tv-screen">
            <svg viewBox="0 0 300 170" width="100%">
              <rect width={300} height={170} fill="#2a4a7a" />
              {Array.from({ length: 8 }, (_, k) => <rect key={k} x={k * 40} y={0} width={20} height={120} fill="#3a5a8a" />)}
              <rect y={110} width={300} height={60} fill="#5a3a20" />
              {anchor && (
                <Place x={150} y={200} scale={0.85}>
                  <ImageG url={anchor.url} height={anchor.height} anim="talk" hold="papers" />
                </Place>
              )}
              <rect x={70} y={128} width={160} height={42} fill="#7a5230" stroke="#1a1410" strokeWidth={3} />
              <text x={150} y={152} fontSize={10} fontWeight={900} textAnchor="middle" fill="#ffd24a">НОВОСТИ ЗОНЫ</text>
              <text x={12} y={22} fontSize={13} fontWeight={900} fill="#fff" stroke="#1a1410" strokeWidth={0.6}>
                ЗОНА-24
              </text>
              <circle cx={284} cy={16} r={5} fill="#e04a3a" className="tv-rec" />
            </svg>
            <div className="tv-line">{text}</div>
          </div>
        </div>
        {v && (
          <button className="btn btn-wide btn-gold" onClick={() => setComic(true)} style={{ marginBottom: 8 }}>
            🎬 Сериал зоны — комикс недели
          </button>
        )}
        {comic && v && <WeeklyComic issue={v.issue} chron={v.chron} cast={v.cast} onClose={() => setComic(false)} />}
        <div className="row gap-s">
          <button className="btn btn-dark grow" disabled={i === 0} onClick={() => setI(i - 1)}>
            ◂
          </button>
          <span className="muted small">
            {list.length ? i + 1 : 0}/{list.length}
          </span>
          <button className="btn grow" disabled={!v || i >= list.length - 1} onClick={() => setI(i + 1)}>
            Следующая новость ▸
          </button>
        </div>
      </div>
    </div>
  );
}
