import { useState } from 'react';
import { PENPAL, PEN_ENDINGS, PEN_LETTERS } from '../shared/penpal.ts';
import { consumableById } from '../shared/perks.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

const fill = (t: string, name: string, me: string) => t.replace(/\{name\}/g, name).replace(/\{me\}/g, me);

/** Заочница в профиле: конверт с письмом или ожидание следующего. */
export function PenpalCard() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  if (p.level < PENPAL.minLevel) return null;
  const s = p.penpal;
  const ready = !!s && !s.ending && now >= s.nextAt;
  return (
    <>
      <button className={`pen-card ${ready ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">{s?.ending ? PEN_ENDINGS[s.ending].emoji : ready ? '💌' : '✉️'}</span>
        <span className="grow">
          <b>{s ? `Заочница: ${s.name}` : 'Заочница'}</b>
          <small>
            {!s
              ? 'Переписка с девушкой с воли'
              : s.ending
                ? PEN_ENDINGS[s.ending].title
                : ready
                  ? `Новое письмо! (${s.step + 1}/${PEN_LETTERS.length})`
                  : `письмо через ${timeLeft(s.nextAt - now)}`}
          </small>
        </span>
        <i>▸</i>
      </button>
      {open && <PenpalModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PenpalModal({ onClose }: { onClose(): void }) {
  const { p, now, act, busy, toast } = useGame();
  const s = p.penpal;
  const me = p.name;
  const reply = async (i: number) => {
    const r = await act<{ got: { butts?: number; heal?: number; item?: string; money?: number }; ending: string | null }>('penReply', { choice: i });
    if (!r) return;
    const g = r.got;
    const parts = [g.butts && `🚬 ${g.butts}`, g.money && `${fmt(g.money)} ₽`, g.heal && `❤️ +${g.heal}`, g.item && `${consumableById.get(g.item)?.emoji ?? '🎁'} ${consumableById.get(g.item)?.name ?? ''}`].filter(Boolean);
    toast(parts.length ? `📦 В конверте: ${parts.join(' · ')}` : '✉️ Ответ ушёл');
  };
  let body;
  if (!s || s.canRestart) {
    body = (
      <div className="pen-start">
        <div className="pen-env big">💌</div>
        <p>На воле есть девушки, которые пишут заключённым. Тёплое письмо, посылка, а там как сложится. Но бывают и аферистки — смотри, кому веришь.</p>
        <button className="btn btn-wide" disabled={busy} onClick={() => act('penStart')}>
          ✍️ Найти заочницу
        </button>
      </div>
    );
  } else if (s.ending) {
    const e = PEN_ENDINGS[s.ending];
    body = (
      <div className={`pen-ending pen-${s.ending}`}>
        <div className="pen-env big">{e.emoji}</div>
        <b>{e.title}</b>
        <p>{fill(e.text, s.name, me)}</p>
        {(e.gold > 0 || e.cosmetic) && (
          <small>
            {e.gold > 0 && `+${e.gold} 🪙 `}
            {e.cosmetic && '· новый титул'}
          </small>
        )}
        <small className="muted">Новая заочница — в следующую ходку</small>
      </div>
    );
  } else if (now < s.nextAt) {
    body = (
      <div className="pen-wait">
        <div className="pen-fly">✉️</div>
        <p>Письмо в пути. Почта на зоне медленная, а цензор читает всё.</p>
        <b>⏳ {timeLeft(s.nextAt - now)}</b>
      </div>
    );
  } else {
    const L = PEN_LETTERS[s.step];
    body = (
      <>
        <div className="pen-paper">
          <div className="pen-stamp">
            {s.step + 1}/{PEN_LETTERS.length}
          </div>
          <p>{fill(L.text, s.name, me)}</p>
          <i>— {s.name}</i>
        </div>
        <div className="pen-choices">
          {L.choices.map((c, i) => (
            <button key={i} className="btn btn-dark" disabled={busy || (c.pay && p.money < PENPAL.moneyAsk)} onClick={() => reply(i)}>
              {c.text}
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h3 className="center">💌 {s && !s.canRestart ? s.name : 'Заочница'}</h3>
        {s && !s.canRestart && !s.ending && (
          <div className="pen-hearts">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={s.love >= (i + 1) * 3 ? 'on' : ''}>
                ❤
              </span>
            ))}
          </div>
        )}
        {body}
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
