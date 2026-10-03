import { useState } from 'react';
import { REPORT, type ReportTopic } from '../shared/support.ts';
import { ApiError, api } from './api.ts';
import { BUILD, recentErrors } from './errlog.ts';

/** Окно жалобы: тема, пара слов и (по желанию) снимок состояния. Работает и без игрового контекста. */
export function ReportModal({ onClose, where, preset }: { onClose(): void; where?: string; preset?: string }) {
  const [topic, setTopic] = useState<ReportTopic>(preset ? 'bug' : 'bug');
  const [text, setText] = useState(preset ?? '');
  const [attach, setAttach] = useState(true);
  const [state, setState] = useState<'edit' | 'sending' | 'sent'>('edit');
  const [err, setErr] = useState('');
  const send = async () => {
    setState('sending');
    setErr('');
    try {
      const ctx = attach
        ? { where: where ?? location.hash, build: BUILD, ua: navigator.userAgent, screen: `${innerWidth}×${innerHeight}`, errors: recentErrors() }
        : { where };
      await api.report(topic, text, ctx);
      setState('sent');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Нет связи с сервером');
      setState('edit');
    }
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body report" onClick={(e) => e.stopPropagation()}>
        <h2>🆘 Сообщить о проблеме</h2>
        {state === 'sent' ? (
          <>
            <div className="report-sent">
              <span>📨</span>
              Передали администрации. Ответ придёт сообщением от бота.
            </div>
            <button className="btn btn-wide" onClick={onClose}>
              Ок
            </button>
          </>
        ) : (
          <>
            <div className="report-topics">
              {REPORT.topics.map((t) => (
                <button key={t.id} className={topic === t.id ? 'active' : ''} onClick={() => setTopic(t.id)}>
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="input report-text"
              rows={4}
              maxLength={REPORT.maxText}
              placeholder="Что случилось? Например: купил золото, не пришло"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="notify-toggle">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              <span>📎 Приложить состояние игры и последние ошибки — так быстрее разберёмся</span>
            </label>
            {err && <div className="verdict lose">{err}</div>}
            <button className="btn btn-wide" disabled={state === 'sending' || text.trim().length < REPORT.minText} onClick={send}>
              {state === 'sending' ? 'Отправляем…' : 'Отправить'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Кнопка в профиле. */
export function ReportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-wide btn-dark report-btn" onClick={() => setOpen(true)}>
        🆘 Сообщить о проблеме
      </button>
      {open && <ReportModal where="profile" onClose={() => setOpen(false)} />}
    </>
  );
}
