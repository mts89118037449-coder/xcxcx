import { ModalHead } from './Nav.tsx';
import { useEffect, useRef, useState } from 'react';
import { QUIZ } from '../shared/quiz.ts';
import { api } from './api.ts';
import { timeLeft, useGame } from './game.tsx';

type View = Awaited<ReturnType<typeof api.quiz>>;

/** Вечер в клубе: карточка с отсчётом до викторины. */
export function QuizCard() {
  const { now } = useGame();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    api.quiz().then(setV).catch(() => null);
  }, [open]);
  const live = v && !v.phase.over && now >= v.startsAt - QUIZ.lobbyMin * 60_000;
  return (
    <>
      <button className={`tourney-card ${live ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="tourney-ico">🎬</span>
        <span className="grow">
          <b>Вечер в клубе — викторина</b>
          <small>
            {!v ? '13:00 и 20:00 по Москве' : v.phase.over ? 'итоги выпуска — загляни' : now >= v.startsAt ? '🔴 ИДЁТ СЕЙЧАС' : `через ${timeLeft(v.startsAt - now)} · 13:00 и 20:00 МСК`}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <QuizModal onClose={() => setOpen(false)} />}
    </>
  );
}

function QuizModal({ onClose }: { onClose(): void }) {
  const { act, busy, toast } = useGame();
  const [v, setV] = useState<View | null>(null);
  const [mine, setMine] = useState<{ q: number; choice: number } | null>(null);
  const offset = useRef(0);
  const [, tick] = useState(0);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api
        .quiz()
        .then((x) => {
          if (stop) return;
          offset.current = x.now - Date.now();
          setV(x);
        })
        .catch(() => null);
    load();
    const id = setInterval(load, 2000);
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => {
      stop = true;
      clearInterval(id);
      clearInterval(t);
    };
  }, []);
  if (!v) return null;
  const now = Date.now() + offset.current;
  const ph = v.phase;
  const step = (QUIZ.qSec + QUIZ.revealSec) * 1000;
  const el = now - v.startsAt;
  const qNow = ph.before ? -1 : Math.min(QUIZ.questions, Math.floor(el / step));
  const inQ = el - qNow * step;
  const answering = qNow === ph.q && inQ < QUIZ.qSec * 1000;
  const secLeft = Math.max(0, Math.ceil((QUIZ.qSec * 1000 - inQ) / 1000));
  const answered = v.myAnswer ?? (mine && mine.q === ph.q ? mine.choice : null);
  const answer = async (i: number) => {
    setMine({ q: ph.q, choice: i });
    const r = await act<{ right: boolean; pts: number }>('quizAnswer', { q: ph.q, choice: i });
    if (r) toast(r.right ? `✅ Верно! +${r.pts}` : '❌ Мимо', r.right ? undefined : 'err');
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <div className="quiz-stage">
          <div className="quiz-lights">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <b>🎬 Вечер в клубе</b>
          <small>{v.players} в зале</small>
        </div>
        {ph.before && (
          <div className="quiz-wait">
            <div className="quiz-count">{timeLeft(v.startsAt - now)}</div>
            <small>до начала. {QUIZ.questions} вопросов по {QUIZ.qSec} секунд: феня, кино, песни, тюрьмы и сама игра. Быстрый верный ответ — до 100 очков.</small>
          </div>
        )}
        {!ph.before && !ph.over && v.question && (
          <div className="quiz-q">
            <div className="quiz-num">
              Вопрос {ph.q + 1}/{QUIZ.questions}
              <span className="quiz-timer">
                <i style={{ width: `${answering ? (secLeft / QUIZ.qSec) * 100 : 0}%` }} />
              </span>
              <b>{answering ? secLeft : '⏸'}</b>
            </div>
            <p>{v.question.text}</p>
            <div className="quiz-opts">
              {v.question.options.map((o, i) => {
                const rev = v.question!.answer;
                const cls = rev !== null ? (i === rev ? 'right' : i === answered ? 'wrong' : '') : i === answered ? 'picked' : '';
                return (
                  <button key={i} className={`quiz-opt ${cls}`} disabled={busy || answered !== null || !answering} onClick={() => answer(i)}>
                    <span>{'АБВГ'[i]}</span> {o}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {ph.over && (
          <div className="quiz-wait">
            <b>Выпуск окончен</b>
            {v.me ? <small>У тебя {v.me.pts} очков, верных {v.me.right}/{QUIZ.questions}</small> : <small>Ты не играл в этот раз</small>}
            {v.claim && (
              <button className="btn" disabled={busy} onClick={() => act('quizClaim').then((r) => r && toast(`🎬 +${v.claim!.gold} 🪙 +${v.claim!.butts} 🚬`))}>
                Забрать: {v.claim.gold > 0 && `${v.claim.gold} 🪙 · `}
                {v.claim.butts} 🚬
              </button>
            )}
          </div>
        )}
        {v.top.length > 0 && (
          <div className="foot-table">
            <b>🏆 Таблица выпуска</b>
            {v.top.map((r, i) => (
              <div key={r.id}>
                <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                <span className="grow">{r.name}</span>
                <small>{r.right} верных</small>
                <b>{r.pts}</b>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
