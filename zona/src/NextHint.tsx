import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../shared/types.ts';
import { useGame, type Tab } from './game.tsx';

interface NextStep {
  id: string;
  tab: Tab;
  /** куда указать на нужной вкладке — первый найденный на экране */
  sel: string[];
  text: string;
}

/** Самое выгодное, что можно сделать прямо сейчас. Дешёвые проверки по состоянию — без запросов. */
export function nextStep(p: PlayerView, now: number): NextStep | null {
  if (now >= p.dailyReadyAt) return { id: 'gift', tab: 'home', sel: ['.scene-gift'], text: 'Грев пришёл — забери' };
  if (p.daily.tasks.some((t) => !t.claimed && t.progress >= t.target)) return { id: 'daily', tab: 'work', sel: ['[data-hint="claim"]', '[data-tut="seg-daily"]'], text: 'Дело дня сделано — забери награду' };
  if (p.statPoints > 0) return { id: 'stats', tab: 'work', sel: ['[data-hint="alloc"]', '[data-tut="seg-gym"]'], text: `Очки силы лежат без дела: ${p.statPoints}` };
  if (p.energy >= p.stats.maxEnergy && p.level >= 2) return { id: 'energy', tab: 'work', sel: ['[data-tut="job"]', '[data-tut="seg-jobs"]'], text: 'Энергия полная и пропадает. Отработай смену' };
  return null;
}

const MUTE = 'zona:hintmute';
const today = () => new Date().toISOString().slice(0, 10);
function muted(): string[] {
  try {
    const m = JSON.parse(localStorage.getItem(MUTE) ?? '{}') as { d?: string; ids?: string[] };
    return m.d === today() ? (m.ids ?? []) : [];
  } catch {
    return [];
  }
}
function mute(id: string) {
  try {
    localStorage.setItem(MUTE, JSON.stringify({ d: today(), ids: [...muted(), id] }));
  } catch {
    /* приватный режим */
  }
}

/** Кольцо-подсказка: пульсирует вокруг вкладки или кнопки, где ждёт выгода. Три раза проигнорировал — до завтра молчит. */
export function NextHint({ tab, place }: { tab: Tab; place: string | null }) {
  const { p, now } = useGame();
  const step = nextStep(p, now);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; label: boolean } | null>(null);
  const ignored = useRef(0);
  const [, force] = useState(0);
  const off = !step || !!place || muted().includes(step.id);
  const id = off ? null : step!.id;

  useEffect(() => {
    ignored.current = 0;
    if (!id || !step) {
      setBox(null);
      return;
    }
    let el: Element | null = null;
    const find = () => {
      // поверх окон не подсказываем
      if (document.querySelector('.modal, .intro-movie, .tut-coach')) return null;
      if (tab !== step.tab) return document.querySelector(`[data-tut="tab-${step.tab === 'top' ? 'fight' : step.tab}"]`);
      for (const s of step.sel) {
        const e = document.querySelector(s);
        if (e && (e as HTMLElement).offsetParent !== null) return e;
      }
      return null;
    };
    const locate = () => {
      el = find();
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return setBox(null);
      setBox({ x: r.left, y: r.top, w: r.width, h: r.height, label: tab === step.tab });
    };
    // не сразу: сначала дать оглядеться
    const t0 = setTimeout(locate, 1500);
    const iv = setInterval(locate, 700);
    const onTap = (e: PointerEvent) => {
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      if (++ignored.current >= 3 && tab === step.tab) {
        mute(step.id);
        setBox(null);
        force((n) => n + 1);
      }
    };
    addEventListener('pointerdown', onTap, true);
    addEventListener('scroll', locate, { passive: true });
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      removeEventListener('pointerdown', onTap, true);
      removeEventListener('scroll', locate);
    };
  }, [id, tab]);

  if (!box || !step) return null;
  const pad = 4;
  const below = box.y < innerHeight / 2;
  return (
    <div className="next-hint" aria-hidden>
      <div className="next-ring" style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }} />
      {box.label && (
        <div className="next-label" style={{ left: Math.max(8, Math.min(innerWidth - 228, box.x + box.w / 2 - 110)), top: below ? box.y + box.h + 10 : undefined, bottom: below ? undefined : innerHeight - box.y + 10 }}>
          👉 {step.text}
        </div>
      )}
    </div>
  );
}
