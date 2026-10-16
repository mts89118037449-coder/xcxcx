// Навигация «назад»: стек открытых окон. Системная кнопка «Назад» в Telegram, свайп вниз и Esc
// закрывают верхнее окно; если окон нет — возвращают со вложенного экрана на главный.
import { useEffect, useRef } from 'react';
import { tg } from './api.ts';

type Back = { id: number; fn: () => void };
const stack: Back[] = [];
let seq = 0;
let fallback: (() => void) | null = null;
const listeners = new Set<() => void>();

function sync() {
  const bb = tg?.BackButton;
  if (bb) {
    if (stack.length || fallback) bb.show();
    else bb.hide();
  }
  listeners.forEach((f) => f());
}

/** Что делать «назад», когда окон нет (например, вернуться из места на вкладку). */
export function setBackFallback(fn: (() => void) | null) {
  fallback = fn;
  sync();
}

export function goBack(): boolean {
  const top = stack[stack.length - 1];
  if (top) {
    top.fn();
    return true;
  }
  if (fallback) {
    fallback();
    return true;
  }
  return false;
}

/** Окно на экране — «назад» закроет его. */
export function useBack(fn: () => void, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const b: Back = { id: ++seq, fn: () => ref.current() };
    stack.push(b);
    sync();
    return () => {
      const i = stack.findIndex((x) => x.id === b.id);
      if (i >= 0) stack.splice(i, 1);
      sync();
    };
  }, [on]);
}

let wired = false;
/** Один раз на запуск: кнопка «Назад» Telegram и Esc на компьютере. */
export function initBack() {
  if (wired) return;
  wired = true;
  tg?.BackButton?.onClick(() => goBack());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') goBack();
  });
}

/** Шапка окна: «← Назад» и «✕» сверху, свайп вниз закрывает. */
export function ModalHead({ onClose, title }: { onClose(): void; title?: string }) {
  useBack(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = ref.current?.parentElement;
    if (!body) return;
    let y0 = 0;
    let dy = 0;
    let drag = false;
    const start = (e: TouchEvent) => {
      // тянуть можно, только когда окно прокручено до верха
      drag = body.scrollTop <= 0;
      y0 = e.touches[0].clientY;
      dy = 0;
    };
    const move = (e: TouchEvent) => {
      if (!drag) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) {
        body.style.transform = `translateY(${dy}px)`;
        body.style.transition = 'none';
      }
    };
    const end = () => {
      if (!drag) return;
      body.style.transition = 'transform 0.2s';
      if (dy > 110) {
        body.style.transform = 'translateY(100%)';
        setTimeout(onClose, 150);
      } else body.style.transform = '';
      drag = false;
    };
    body.addEventListener('touchstart', start, { passive: true });
    body.addEventListener('touchmove', move, { passive: true });
    body.addEventListener('touchend', end);
    return () => {
      body.removeEventListener('touchstart', start);
      body.removeEventListener('touchmove', move);
      body.removeEventListener('touchend', end);
    };
  }, [onClose]);
  return (
    <div className="modal-head" ref={ref}>
      <span className="modal-grip" />
      <button className="modal-nav" aria-label="Назад" onClick={onClose}>
        ←
      </button>
      {title && <b className="modal-title">{title}</b>}
      <button className="modal-nav" aria-label="Закрыть" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
