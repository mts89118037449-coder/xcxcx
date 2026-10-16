import { ModalHead } from './Nav.tsx';
import { useEffect, useRef, useState } from 'react';
import { TUTORIAL, TUT_GIFT } from '../shared/tutorial.ts';
import { consumableById } from '../shared/perks.ts';
import { jumpSeg } from './Seg.tsx';
import { play } from './sound.ts';
import { useGame, type Tab } from './game.tsx';

interface Aim {
  x: number;
  y: number;
  /** стрелка снизу и смотрит вверх — если цель у самого верха */
  up: boolean;
  /** цель за краем экрана: показываем «листай» */
  edge: 'down' | 'up' | null;
}

/** Первый видимый элемент с меткой обучения. */
function findTarget(ids: string[]): HTMLElement | SVGElement | null {
  for (const id of ids) {
    for (const el of document.querySelectorAll<HTMLElement | SVGElement>(`[data-tut="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled) return el;
    }
  }
  return null;
}

/** Обучение первых минут: подсказка внизу и прыгающая стрелка над тем, что нажать. */
export function TutorialCoach({ tab }: { tab: Tab }) {
  const { p, act, go } = useGame();
  const [aim, setAim] = useState<Aim | null>(null);
  const [gift, setGift] = useState(false);
  // открыт диалог или окно — подсказка уходит наверх, чтобы не закрывать кнопки
  const [overlay, setOverlay] = useState(false);
  const was = useRef(p.tut);
  const skipped = useRef(false);
  const step = p.tut && p.intro < 0 ? TUTORIAL[p.tut.step] : null;

  // обучение закончилось само (а не пропуском) — показываем подарок
  useEffect(() => {
    if (was.current && !p.tut && !skipped.current) {
      setGift(true);
      play('level');
    }
    was.current = p.tut;
  }, [p.tut]);

  useEffect(() => {
    document.body.classList.toggle('has-tut', !!step);
    if (!step) return setAim(null);
    const find = () => {
      setOverlay(!!document.querySelector('.dialog, .modal'));
      const segHint = step.seg && tab === step.tab ? [`seg-${step.seg[1]}`] : [];
      const el = findTarget(tab === step.tab ? [...step.targets, ...segHint] : []) ?? findTarget([...step.targets.filter((t) => t === 'trade'), `tab-${step.tab}`]);
      if (!el) return setAim(null);
      const r = el.getBoundingClientRect();
      const h = innerHeight;
      if (r.bottom < 0) return setAim({ x: innerWidth / 2, y: 70, up: true, edge: 'up' });
      if (r.top > h - 70 && !el.closest('.tabs')) return setAim({ x: innerWidth / 2, y: h - 150, up: false, edge: 'down' });
      const up = r.top < 70;
      setAim({ x: r.left + r.width / 2, y: up ? r.bottom + 4 : r.top - 4, up, edge: null });
    };
    find();
    const id = setInterval(find, 300);
    return () => clearInterval(id);
  }, [step, tab]);

  const lead = () => {
    if (!step) return;
    if (step.seg) jumpSeg(step.seg[0], step.seg[1]);
    go(step.tab);
  };

  return (
    <>
      {step && (
        <div className={`tut-coach ${overlay ? 'top' : ''}`} onClick={lead}>
          <span className="tut-num">
            {p.tut!.step + 1}/{TUTORIAL.length}
          </span>
          <span className="grow">
            <b>
              {step.text}
              {step.n > 1 ? ` · ${p.tut!.n}/${step.n}` : ''}
            </b>
            <small>{step.why}</small>
          </span>
          <button
            className="tut-skip"
            onClick={(e) => {
              e.stopPropagation();
              if (!confirm('Пропустить обучение? Подарок за него не дадут.')) return;
              skipped.current = true;
              act('tutSkip');
            }}
          >
            ✕
          </button>
        </div>
      )}
      {step && aim && (
        <div className={`tut-arrow ${aim.up ? 'up' : ''} ${aim.edge ? 'edge' : ''}`} style={{ left: aim.x, top: aim.y }}>
          {aim.edge === 'down' ? '⬇ листай' : aim.edge === 'up' ? '⬆ листай' : aim.up ? '👆' : '👇'}
        </div>
      )}
      {gift && (
        <div className="modal" onClick={() => setGift(false)}>
          <div className="modal-body tut-gift" onClick={(e) => e.stopPropagation()}>
            <ModalHead onClose={() => setGift(false)} />
            <div className="tut-gift-box">🎁</div>
            <h2>Освоился!</h2>
            <p className="muted">Теперь ты знаешь, как тут всё устроено. Держи грев на первое время:</p>
            <div className="tut-gift-list">
              <span>🪙 {TUT_GIFT.gold}</span>
              <span>₽ {TUT_GIFT.money}</span>
              {[...new Set(TUT_GIFT.items)].map((id) => (
                <span key={id}>
                  {consumableById.get(id)?.emoji} ×{TUT_GIFT.items.filter((x) => x === id).length}
                </span>
              ))}
            </div>
            <p className="muted small">Дальше ведёт сюжет — подсказка сверху покажет, что делать.</p>
            <button className="btn btn-wide" onClick={() => setGift(false)}>
              Погнали
            </button>
          </div>
        </div>
      )}
    </>
  );
}
