import { useEffect, useState } from 'react';
import { WORD } from '../shared/fenya.ts';
import { api } from './api.ts';
import { fmt, useGame } from './game.tsx';

const ROWS = ['ЙЦУКЕНГШЩЗХ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮЪ'];

/** Карточка «Слово дня» на вкладке игр. */
export function WordCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const w = p.word;
  return (
    <>
      <button className={`tourney-card ${!w.done ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="tourney-ico">🔤</span>
        <span className="grow">
          <b>Слово дня по фене</b>
          <small>
            {w.done ? (w.won ? `разгадал за ${w.guesses.length} · серия ${w.streak}` : 'не вышло — завтра новое') : `${w.len} букв · ${WORD.tries - w.guesses.length} попыток`}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <WordModal onClose={() => setOpen(false)} />}
    </>
  );
}

function WordModal({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const w = p.word;
  const [cur, setCur] = useState('');
  const [table, setTable] = useState<{ solved: number; top: { id: number; name: string; tries: number }[] } | null>(null);
  useEffect(() => {
    if (w.done) api.word().then(setTable).catch(() => null);
  }, [w.done]);
  // что известно про буквы — для раскраски клавиатуры
  const known: Record<string, 'g' | 'y' | 'x'> = {};
  for (const r of w.guesses)
    [...r.g].forEach((ch, i) => {
      const m = r.marks[i];
      if (known[ch] === 'g' || (known[ch] === 'y' && m === 'x')) return;
      known[ch] = m;
    });
  const send = async () => {
    if (cur.length !== w.len) return toast(`Нужно ${w.len} букв`, 'err');
    const r = await act<{ won: boolean; done: boolean; reward: { money: number; butts: number; gold: number } | null }>('wordGuess', { guess: cur });
    if (!r) return;
    setCur('');
    if (r.won && r.reward) toast(`Угадал! +${fmt(r.reward.money)} ₽ +${r.reward.butts} 🚬${r.reward.gold ? ` +${r.reward.gold} 🪙` : ''}`);
  };
  const key = (ch: string) => !w.done && cur.length < w.len && setCur(cur + ch);
  const rows = Array.from({ length: WORD.tries }, (_, i) => w.guesses[i] ?? (i === w.guesses.length && !w.done ? { g: cur, marks: null } : { g: '', marks: null }));
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body word" onClick={(e) => e.stopPropagation()}>
        <h2>🔤 Слово дня</h2>
        <div className="muted small center">
          Тюремное слово из {w.len} букв. Зелёная — на месте, жёлтая — есть, но не тут. Серия: {w.streak} · рекорд {w.best}
        </div>
        <div className="word-grid" style={{ ['--n' as string]: w.len }}>
          {rows.map((r, i) =>
            Array.from({ length: w.len }, (_, j) => (
              <span key={`${i}-${j}`} className={`word-cell ${r.marks ? r.marks[j] : r.g[j] ? 'typed' : ''}`} style={{ animationDelay: `${j * 0.08}s` }}>
                {r.g[j] ?? ''}
              </span>
            )),
          )}
        </div>
        {w.done ? (
          <div className="word-done">
            <b className={w.won ? 'win' : 'lose'}>{w.won ? '✔ Угадал!' : '✖ Не угадал'}</b>
            <div>
              <b>{w.answer}</b> — {w.meaning}
            </div>
            {table && (
              <div className="muted small">
                Сегодня разгадали: {table.solved}
                {table.top.length > 0 && ` · лучшие: ${table.top.slice(0, 5).map((x) => `${x.name} (${x.tries})`).join(', ')}`}
              </div>
            )}
            <div className="muted small">Новое слово — завтра в полночь по Москве. Серия 3 дня — 3 🪙, 7 дней — 10 🪙, 30 — 40 🪙.</div>
          </div>
        ) : (
          <div className="word-keys">
            {ROWS.map((row, i) => (
              <div key={i}>
                {i === 2 && (
                  <button className="wide" onClick={() => setCur(cur.slice(0, -1))}>
                    ⌫
                  </button>
                )}
                {[...row].map((ch) => (
                  <button key={ch} className={known[ch] ?? ''} onClick={() => key(ch)}>
                    {ch}
                  </button>
                ))}
                {i === 2 && (
                  <button className="wide go" disabled={busy || cur.length !== w.len} onClick={send}>
                    ⏎
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
