import { api } from './api.ts';
import { fmt, timeLeft, useGame } from './game.tsx';
import { REVENGE } from '../shared/league.ts';

const ago = (t: number, now: number) => {
  const m = Math.floor((now - t) / 60_000);
  return m < 60 ? `${m} мин назад` : m < 24 * 60 ? `${Math.floor(m / 60)} ч назад` : `${Math.floor(m / 1440)} дн. назад`;
};

/** Кто на меня наезжал: повтор боя и месть (сутки, одна попытка, очки лиги вдвойне). */
export function AttacksCard() {
  const { p, now, act, busy, showFight, toast } = useGame();
  if (!p.attacks.length) return null;
  const replay = async (at: number) => {
    try {
      const r = await api.attack(at);
      showFight({
        title: r.attack.won ? `🥊 ${r.attack.name} наехал` : `🛡️ ${r.attack.name} огрёб`,
        replay: r.attack.replay,
        enemy: { name: r.attack.name, look: r.attack.look },
        me: r.me,
        verdict: r.attack.won ? `Отжал ${fmt(r.attack.loot)} ₽` : 'Отбился',
        lines: [],
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не загрузилось', 'err');
    }
  };
  return (
    <div className="card attacks">
      <b>🥊 Наезды на тебя</b>
      {p.attacks.map((a) => (
        <div key={a.at} className={`attack-row ${a.won ? 'lost' : 'held'}`}>
          <span className="grow">
            {a.won ? '💢' : '🛡️'} <b>{a.name}</b>
            <small>
              {a.won ? `отжал ${fmt(a.loot)} ₽` : 'полез и огрёб'} · {ago(a.at, now)}
            </small>
          </span>
          <button className="btn btn-s btn-dark" onClick={() => replay(a.at)}>
            ▶
          </button>
          {a.canAvenge && (
            <button className="btn btn-s btn-red" disabled={busy || p.hp < p.stats.maxHp * 0.3} onClick={() => act('revenge', { at: a.at })} title={`ещё ${timeLeft(a.at + REVENGE.hours * 3600_000 - now)}`}>
              😤 Отомстить
            </button>
          )}
          {a.won && a.avenged && <small className="muted">отомщён</small>}
        </div>
      ))}
      <div className="muted small">Отомстить можно в течение суток, одна попытка: очки лиги ×{REVENGE.leagueMul}, а отжатое — назад.</div>
    </div>
  );
}
