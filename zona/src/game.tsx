import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FightReplay, Look, PlayerView } from '../shared/types.ts';

export type Tab = 'home' | 'work' | 'fight' | 'gear' | 'top' | 'shop';

export interface FightLog {
  title: string;
  replay: FightReplay;
  enemy: { name: string; look: Look; build?: number; npc?: string };
  lines: string[]; // итоги: награды, трофеи
}

export interface Game {
  p: PlayerView;
  online: number;
  botUsername: string;
  now: number;
  busy: boolean;
  act<R = unknown>(type: string, body?: Record<string, unknown>): Promise<R | null>;
  refresh(): Promise<void>;
  toast(text: string, kind?: 'ok' | 'err'): void;
  showFight(f: FightLog): void;
  go(tab: Tab): void;
}

export const GameCtx = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameCtx);
  if (!g) throw new Error('GameCtx');
  return g;
}

/** Текущее время, обновляется раз в секунду — для таймеров. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('ru-RU');
}

export function timeLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${String(sec).padStart(2, '0')}с`;
  return `${sec}с`;
}

export function Bar({ value, max, kind, label }: { value: number; max: number; kind: 'hp' | 'en' | 'xp' | 'boss'; label?: ReactNode }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      <span className="bar-label">{label ?? `${fmt(value)} / ${fmt(max)}`}</span>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Price({ amount, currency }: { amount: number; currency: 'money' | 'gold' | 'stars' }) {
  const icon = currency === 'money' ? '₽' : currency === 'gold' ? '🪙' : '⭐';
  return (
    <span className={`price price-${currency}`}>
      {fmt(amount)} {icon}
    </span>
  );
}

export function BonusList({ b }: { b: { atk?: number; def?: number; hp?: number; crit?: number; energy?: number; money?: number } }) {
  const parts: string[] = [];
  if (b.atk) parts.push(`⚔️+${b.atk}`);
  if (b.def) parts.push(`🛡️+${b.def}`);
  if (b.hp) parts.push(`❤️+${b.hp}`);
  if (b.crit) parts.push(`💥+${b.crit}%`);
  if (b.energy) parts.push(`⚡+${b.energy}`);
  if (b.money) parts.push(`₽+${b.money}%`);
  return <span className="bonus">{parts.join('  ')}</span>;
}

/** Перезапускаемая анимация: play('act-work') → класс и ключ, чтобы пересоздать элемент. */
export function useAnim(): [string, number, (cls: string) => void] {
  const [state, setState] = useState({ cls: '', key: 0 });
  const play = useCallback((cls: string) => setState((s) => ({ cls, key: s.key + 1 })), []);
  return [state.cls, state.key, play];
}

export function lookOf(p: PlayerView): Look {
  return { equipped: p.equipped, tattoos: p.tattoos, str: p.str, face: p.face };
}
