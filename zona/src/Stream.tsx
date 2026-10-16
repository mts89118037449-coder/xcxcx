import { useMemo, useState } from 'react';
import { STREAM, STREAM_COMMENTS, STREAM_GIFTS, STREAM_TOPICS } from '../shared/stream.ts';
import { ModalHead } from './Nav.tsx';
import { NowChip } from './Chip.tsx';
import { Face } from './art/sprites.tsx';
import { timeLeft, useGame } from './game.tsx';
import { play } from './sound.ts';

/** Плашка «Стримы» на карте: сколько хат сейчас в эфире. */
export function StreamChip() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < STREAM.minLevel && !p.streams.length) return null;
  const others = p.streams.filter((s) => s.id !== p.id);
  return (
    <>
      <NowChip icon="📱" label="Стримы" sub={others.length ? `в эфире: ${others.length}` : 'выйти в эфир'} hot={others.some((s) => !s.liked)} onClick={() => setOpen(true)} />
      {open && <StreamsModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function StreamsModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy } = useGame();
  const mine = p.streams.find((s) => s.id === p.id);
  // три темы на выбор — каждый раз свои
  const topics = useMemo(() => [...STREAM_TOPICS.keys()].sort(() => Math.random() - 0.5).slice(0, 3), []);
  const [open, setOpen] = useState<number | null>(null);
  const like = async (id: number) => {
    if (await act('streamLike', { id })) play('pop');
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="📱 Стримы из хат" />
        {mine ? (
          <div className="stream-mine">
            <span className="stream-live">● В ЭФИРЕ</span>
            <b>«{mine.topic}»</b>
            <small>
              ❤️ {mine.likes} · 🚬×{mine.gifts.butts} · 💝×{mine.gifts.heart} · ещё {timeLeft(mine.until - now)}
            </small>
            <Chat list={mine.comments} />
          </div>
        ) : p.level < STREAM.minLevel ? (
          <p className="muted small">Запрещённый телефон доверяют с {STREAM.minLevel} уровня.</p>
        ) : p.streamToday ? (
          <p className="muted small">Сегодня уже стримил. Завтра — новый эфир.</p>
        ) : (
          <div className="stream-start">
            <b>Выйти в эфир на {STREAM.minutes} минут</b>
            <small>Каждый лайк — {STREAM.buttsPerLike} 🚬 тебе. Тема эфира:</small>
            {topics.map((i) => (
              <button key={i} className="ev-opt" disabled={busy} onClick={() => act('streamStart', { topic: i })}>
                {STREAM_TOPICS[i]}
              </button>
            ))}
          </div>
        )}
        {p.funny.length > 0 && (
          <div className="raid-top">
            <b>🤣 Самый смешной недели</b>
            {p.funny.map((f, i) => (
              <div key={f.id} className={f.id === p.id ? 'me' : ''}>
                <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                <span className="grow">{f.name}</span>
                <span>{f.pts} 😂</span>
              </div>
            ))}
          </div>
        )}
        <h4 className="stream-h">Сейчас в эфире</h4>
        {p.streams.filter((s) => s.id !== p.id).length === 0 && <p className="muted small">Тихо. Видимо, у всех отобрали телефоны.</p>}
        <div className="stream-list">
          {p.streams
            .filter((s) => s.id !== p.id)
            .map((s) => (
              <div key={s.id} className="stream-card">
                <div className="stream-row" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <Face face={s.face} skin={s.skin} size={40} />
                  <span className="grow">
                    <b>{s.name}</b>
                    <small>«{s.topic}» · ещё {timeLeft(s.until - now)}</small>
                  </span>
                  <button
                    className={`btn btn-s ${s.liked ? 'btn-dark' : 'btn-red'}`}
                    disabled={busy || s.liked}
                    onClick={(e) => {
                      e.stopPropagation();
                      like(s.id);
                    }}
                  >
                    ❤️ {s.likes}
                  </button>
                </div>
                {open === s.id && (
                  <div className="stream-room">
                    <Chat list={s.comments} />
                    <div className="stream-say">
                      {STREAM_COMMENTS.map((c, i) => (
                        <button key={i} disabled={busy} onClick={() => act('streamComment', { id: s.id, msg: i })}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="row gap-s">
                      <button className="btn btn-s btn-dark grow" disabled={busy || p.butts < STREAM_GIFTS.butts.cost} onClick={() => act('streamGift', { id: s.id, kind: 'butts' }).then((r) => r && play('coin'))}>
                        🚬 Кинуть {STREAM_GIFTS.butts.cost} бычка
                      </button>
                      <button className="btn btn-s btn-gold grow" disabled={busy || p.gold < STREAM_GIFTS.heart.cost} onClick={() => act('streamGift', { id: s.id, kind: 'heart' }).then((r) => r && play('gold'))}>
                        💝 Сердечко с колючкой · {STREAM_GIFTS.heart.cost} 🪙
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Последние комментарии эфира. */
function Chat({ list }: { list: { name: string; msg: number }[] }) {
  if (!list.length) return <small className="muted">Комментариев пока нет — чат стесняется.</small>;
  return (
    <div className="stream-chat">
      {list.map((c, i) => (
        <div key={i}>
          <b>{c.name}:</b> {STREAM_COMMENTS[c.msg]}
        </div>
      ))}
    </div>
  );
}
