import { useEffect, useState } from 'react';
import { api, type AdminError, type AdminReport, type SusRow } from './api.ts';
import { REPORT } from '../shared/support.ts';
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

/** Жалобы игроков и ошибки из браузеров. */
export function AdminReports() {
  const { toast } = useGame();
  const [data, setData] = useState<{ reports: AdminReport[]; errors: AdminError[] } | null>(null);
  const [view, setView] = useState<'reports' | 'errors'>('reports');
  const [open, setOpen] = useState<number | string | null>(null);
  const [reply, setReply] = useState('');
  const load = (body: Parameters<typeof api.adminReports>[0] = {}) =>
    api
      .adminReports(body)
      .then(setData)
      .catch((e) => toast(e instanceof Error ? e.message : 'Не загрузилось', 'err'));
  useEffect(() => {
    load();
  }, []);
  if (!data) return <div className="muted center">Загрузка…</div>;
  const fresh = data.reports.filter((r) => !r.done).length;
  return (
    <div className="sus-list">
      <div className="seg">
        <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
          🆘 Жалобы{fresh ? ` · ${fresh}` : ''}
        </button>
        <button className={view === 'errors' ? 'active' : ''} onClick={() => setView('errors')}>
          🐞 Ошибки · {data.errors.length}
        </button>
      </div>
      {view === 'reports' &&
        (data.reports.length ? (
          data.reports.map((r) => {
            const t = REPORT.topics.find((x) => x.id === r.topic);
            return (
              <div key={r.id} className={`sus-row ${r.done ? 'banned' : 'hot'}`}>
                <button className="sus-head" onClick={() => (setOpen(open === r.id ? null : r.id), setReply(''))}>
                  <b>
                    {t?.icon} #{r.id} {r.name}
                  </b>
                  <small>{when(r.at)}</small>
                  <i>{r.done ? '✔' : '•'}</i>
                </button>
                <div className="report-body">{r.text}</div>
                {open === r.id && (
                  <>
                    <pre className="report-ctx">{JSON.stringify({ ...r.ctx.snap, ...r.ctx.client }, null, 1)}</pre>
                    <textarea className="input report-text" rows={2} placeholder="Ответ игроку (придёт от бота)" value={reply} onChange={(e) => setReply(e.target.value)} />
                    <div className="row">
                      <button className="btn btn-s" disabled={!reply.trim()} onClick={() => load({ reply: { id: r.id, text: reply } }).then(() => (setReply(''), toast('Ответ отправлен')))}>
                        💬 Ответить
                      </button>
                      {!r.done && (
                        <button className="btn btn-s btn-dark" onClick={() => load({ done: r.id })}>
                          ✔ Закрыть
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <div className="muted center small">Жалоб нет.</div>
        ))}
      {view === 'errors' && (
        <>
          {data.errors.length ? (
            data.errors.map((e) => (
              <div key={e.hash} className="sus-row">
                <button className="sus-head" onClick={() => setOpen(open === e.hash ? null : e.hash)}>
                  <b>{e.msg}</b>
                  <small />
                  <i>×{e.n}</i>
                </button>
                {open === e.hash && (
                  <>
                    <div className="sus-log">
                      <small>
                        первая {when(e.first)} · последняя {when(e.last)}
                        {e.pid ? ` · игрок ${e.pid}` : ''}
                      </small>
                    </div>
                    <pre className="report-ctx">{e.stack || 'без стека'}</pre>
                    <div className="sus-log">
                      <small>{e.ua}</small>
                    </div>
                    <div className="row">
                      <button className="btn btn-s btn-dark" onClick={() => load({ errDel: e.hash })}>
                        ✔ Починено
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <div className="muted center small">Ошибок нет.</div>
          )}
          {data.errors.length > 1 && (
            <button className="btn btn-s btn-dark" onClick={() => confirm('Очистить все ошибки?') && load({ errDel: 'all' })}>
              Очистить всё
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function AdminLive() { return null; }
