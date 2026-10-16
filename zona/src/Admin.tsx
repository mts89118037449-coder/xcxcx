import { ModalHead } from './Nav.tsx';
import { useState } from 'react';
import { EVENTS } from '../shared/events.ts';
import { useGame } from './game.tsx';
import { AdminStats } from './AdminStats.tsx';
import { AdminLive, AdminReports, AdminSus } from './AdminTools.tsx';

/** Панель админа: режим игрока или бога и инструменты для тестов. */
export function AdminPanel({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [lvl, setLvl] = useState(p.level);
  const [ev, setEv] = useState(EVENTS[0].id);
  const [pane, setPane] = useState<'' | 'stats' | 'sus' | 'reports' | 'live'>('');
  const tool = async (t: string, arg = '', msg = 'Готово') => {
    if ((await act('adminTool', { tool: t, arg })) !== null) toast(msg);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body admin" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <h2>⚙️ Админ</h2>
        <div className="admin-panes">
          {(
            [
              ['stats', '📊', 'Статистика'],
              ['sus', '🕵️', 'Накрутки'],
              ['reports', '🆘', 'Жалобы'],
              ['live', '🎪', 'События'],
            ] as const
          ).map(([id, icon, label]) => (
            <button key={id} className={pane === id ? 'active' : ''} onClick={() => setPane(pane === id ? '' : id)}>
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        {pane === 'stats' && <AdminStats />}
        {pane === 'sus' && <AdminSus />}
        {pane === 'reports' && <AdminReports />}
        {pane === 'live' && <AdminLive />}
        <div className="seg">
          <button className={!p.god ? 'active' : ''} disabled={busy || !p.god} onClick={() => act('adminGod')}>
            👤 Игрок
          </button>
          <button className={p.god ? 'active' : ''} disabled={busy || p.god} onClick={() => act('adminGod')}>
            ⚡ Бог
          </button>
        </div>
        <p className="muted small">
          {p.god
            ? 'Бог: деньги, золото, энергия и здоровье бесконечны, все откаты сброшены. Выключишь — ресурсы вернутся как были.'
            : 'Игрок: обычные правила, как у всех.'}
        </p>
        <div className="admin-row">
          <span>Уровень</span>
          <button className="btn btn-s btn-dark" onClick={() => setLvl(Math.max(1, lvl - 1))}>−</button>
          <b>{lvl}</b>
          <button className="btn btn-s btn-dark" onClick={() => setLvl(Math.min(60, lvl + 1))}>+</button>
          <button className="btn btn-s" disabled={busy} onClick={() => tool('level', String(lvl), `Уровень ${lvl}`)}>Поставить</button>
        </div>
        <div className="admin-grid">
          <button className="btn btn-dark" disabled={busy} onClick={() => tool('furniture', '', 'Вся мебель в хате')}>🛋️ Вся мебель</button>
          <button className="btn btn-dark" disabled={busy} onClick={() => tool('gear', '', 'Весь шмот в мешке')}>🎒 Весь шмот</button>
          <button className="btn btn-dark" disabled={busy} onClick={() => tool('items', '', '+10 каждого расходника')}>💊 +10 расходников</button>
          <button className="btn btn-dark" disabled={busy} onClick={() => tool('battleEnd', '', 'Бой сброшен')}>🥊 Сбросить бой</button>
        </div>
        <div className="admin-row">
          <select className="input" value={ev} onChange={(e) => setEv(e.target.value)}>
            {EVENTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}: {e.text.slice(0, 30)}…
              </option>
            ))}
          </select>
          <button className="btn btn-s" disabled={busy} onClick={() => tool('event', ev, 'Случай запущен')}>❗</button>
        </div>
        <button
          className="btn btn-wide btn-red"
          disabled={busy}
          onClick={() => confirm('Сбросить персонажа до новичка?') && tool('newbie', '', 'Ты снова новичок')}
        >
          ♻️ Стать новичком
        </button>
        <button className="btn btn-wide btn-dark" style={{ marginTop: 8 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
