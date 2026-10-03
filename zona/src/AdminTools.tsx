import { useEffect, useState } from 'react';
import { api, type SusRow } from './api.ts';
import { useGame } from './game.tsx';

const GAME_NAMES: Record<string, string> = {
  speed: '⚡ чифир на скорость',
  conveyor: '📦 конвейер',
  beads: '📿 чётки',
  fish: '🎣 рыбалка',
  darts: '🎯 заточка',
  arm: '💪 армрестлинг',
  pullups: '🏋️ турник',
  brew: '☕ чифир',
};

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Подозреваемые в накрутке: счёт, последние странности, простить или заблокировать. */
export function AdminSus() {
  const { toast } = useGame();
  const [data, setData] = useState<{ list: SusRow[]; flagAt: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = (id?: number, act?: 'clear' | 'ban' | 'unban') =>
    api
      .adminSus(id, act)
      .then(setData)
      .catch((e) => toast(e instanceof Error ? e.message : 'Не загрузилось', 'err'));
  useEffect(() => {
    load();
  }, []);
  if (!data) return <div className="muted center">Загрузка…</div>;
  if (!data.list.length) return <div className="muted center small">Подозрительных нет. Сервер засекает каждую мини-игру и отмечает слишком быстрые и идеальные результаты.</div>;
  return (
    <div className="sus-list">
      <div className="muted small">Красные — выше порога {data.flagAt}. Счёт сам остывает со временем. Невозможные результаты сервер уже не засчитал.</div>
      {data.list.map((r) => (
        <div key={r.id} className={`sus-row ${r.banned ? 'banned' : r.score >= data.flagAt ? 'hot' : ''}`}>
          <button className="sus-head" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <b>{r.name}</b>
            <small>
              ур. {r.level} · id {r.id}
            </small>
            <i>{r.banned ? '⛔' : r.score}</i>
          </button>
          {open === r.id && (
            <>
              {r.log.map((l, i) => (
                <div key={i} className="sus-log">
                  <small>{when(l.t)}</small> {GAME_NAMES[l.game] ?? l.game}: {l.why}
                </div>
              ))}
              <div className="row">
                <button className="btn btn-s btn-dark" onClick={() => load(r.id, 'clear')}>
                  🙏 Простить
                </button>
                {r.banned ? (
                  <button className="btn btn-s" onClick={() => load(r.id, 'unban')}>
                    🔓 Разблокировать
                  </button>
                ) : (
                  <button className="btn btn-s btn-red" onClick={() => confirm(`Заблокировать ${r.name}?`) && load(r.id, 'ban')}>
                    ⛔ Заблокировать
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
