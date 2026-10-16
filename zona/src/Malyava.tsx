import { ModalHead } from './Nav.tsx';
import { useEffect, useState } from 'react';
import { MALYAVA, MALYAVY, malyavaById } from '../shared/malyava.ts';
import { api } from './api.ts';
import { showDiscipline } from './discipline.ts';
import { timeLeft, useGame } from './game.tsx';

const ago = (ms: number) => (ms < 60_000 ? 'только что' : `${timeLeft(ms)} назад`);

/** Написать маляву игроку: выбрать фразу, вложить бычки, отправить сам или через шныря. */
export function MalyavaComposer({ to, onClose }: { to: { id: number; name: string }; onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [msg, setMsg] = useState(MALYAVY[0].id);
  const [butts, setButts] = useState(0);
  const send = async (safe: boolean) => {
    const r = await act<{ caught: boolean; days: number }>('malyava', { id: to.id, msg, butts, safe });
    if (!r) return;
    if (r.caught) showDiscipline(r.days, `перехваченная малява: «${malyavaById.get(msg)?.text ?? ''}»`);
    else toast(`✉️ Малява ушла к ${to.name}`);
    onClose();
  };
  const risky = malyavaById.get(msg)?.risky;
  return (
    <div className="mal-box">
      <b>✉️ Малява для {to.name}</b>
      <div className="mal-list">
        {MALYAVY.map((m) => (
          <button key={m.id} className={`mal-opt ${msg === m.id ? 'on' : ''} ${m.risky ? 'risky' : ''}`} onClick={() => setMsg(m.id)}>
            {m.risky && '⚠️ '}
            {m.text}
          </button>
        ))}
      </div>
      <div className="row gap-s">
        <span className="muted small">Вложить:</span>
        {MALYAVA.butts.map((b) => (
          <button key={b} className={`btn btn-s ${butts === b ? '' : 'btn-dark'}`} disabled={b > p.butts} onClick={() => setButts(b)}>
            {b ? `🚬 ${b}` : 'ничего'}
          </button>
        ))}
      </div>
      <small className="muted">Вертухай перехватит с шансом {risky ? MALYAVA.interceptRisky : MALYAVA.intercept}% — тогда кум прочтёт вслух, а тебе +{risky ? MALYAVA.termPenaltyRisky : MALYAVA.termPenalty} дн.</small>
      <div className="row gap-s">
        <button className="btn grow" disabled={busy} onClick={() => send(false)}>
          ✉️ Сам
        </button>
        <button className="btn btn-dark grow" disabled={busy || p.gold < MALYAVA.safeGold} onClick={() => send(true)}>
          🧹 Через шныря · {MALYAVA.safeGold} 🪙
        </button>
      </div>
    </div>
  );
}

/** Почта в профиле: входящие малявы и что перехватил кум. */
export function MailCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const unread = p.inbox.filter((m) => !m.read).length;
  return (
    <>
      <button className={`pen-card ${unread ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">📨</span>
        <span className="grow">
          <b>Малявы {unread > 0 && <span className="mal-badge">{unread}</span>}</b>
          <small>{p.inbox.length ? `последняя от ${p.inbox[0].fromName}` : 'пиши из чужой хаты — кнопка «Малява»'}</small>
        </span>
        <i>▸</i>
      </button>
      {open && <MailModal onClose={() => setOpen(false)} />}
    </>
  );
}

function MailModal({ onClose }: { onClose(): void }) {
  const { p, now, act } = useGame();
  const [tab, setTab] = useState<'in' | 'kum'>('in');
  const [feed, setFeed] = useState<{ from: string; to: string; msg: string; at: number }[] | null>(null);
  useEffect(() => {
    if (p.inbox.some((m) => !m.read)) act('malyavaRead');
  }, []);
  useEffect(() => {
    if (tab === 'kum' && !feed) api.kum().then((r) => setFeed(r.feed)).catch(() => setFeed([]));
  }, [tab]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <div className="row gap-s">
          <button className={`btn grow ${tab === 'in' ? '' : 'btn-dark'}`} onClick={() => setTab('in')}>
            📨 Мне
          </button>
          <button className={`btn grow ${tab === 'kum' ? '' : 'btn-dark'}`} onClick={() => setTab('kum')}>
            👮 Кум читает
          </button>
        </div>
        <div className="mal-feed">
          {tab === 'in' &&
            (p.inbox.length ? (
              p.inbox.map((m) => (
                <div key={m.id} className={`mal-note ${m.read ? '' : 'new'}`}>
                  <p>«{malyavaById.get(m.msg)?.text ?? '…'}»</p>
                  <small>
                    — {m.fromName} · {ago(now - m.at)}
                    {m.butts > 0 && ` · 🚬 ${m.butts}`}
                  </small>
                </div>
              ))
            ) : (
              <div className="muted center">Пока никто не писал</div>
            ))}
          {tab === 'kum' &&
            (feed?.length ? (
              feed.map((m, i) => (
                <div key={i} className="mal-note kum">
                  <p>«{malyavaById.get(m.msg)?.text ?? '…'}»</p>
                  <small>
                    {m.from} → {m.to} · {ago(now - m.at)}
                  </small>
                </div>
              ))
            ) : (
              <div className="muted center">{feed ? 'Кум скучает — ничего не перехватили' : 'Загрузка…'}</div>
            ))}
        </div>
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
