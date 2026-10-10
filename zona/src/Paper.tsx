import { useEffect, useState } from 'react';
import { BARRACKS } from '../shared/barracks.ts';
import { DECREES } from '../shared/elect.ts';
import { malyavaById } from '../shared/malyava.ts';
import { api } from './api.ts';
import { fmt } from './game.tsx';

type Paper = Awaited<ReturnType<typeof api.paper>>;

/** Стенгазета: свёрнутая — заголовок выпуска, развёрнутая — газетная полоса. */
export function PaperCard() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Paper | null>(null);
  useEffect(() => {
    api.paper().then(setV).catch(() => null);
  }, []);
  const head = v?.chron[0];
  return (
    <>
      <button className="paper-card" onClick={() => setOpen(true)}>
        <span className="paper-mast">ЗА РЕШЁТКОЙ</span>
        <small>
          стенгазета № {v?.issue ?? '…'} · {head ? `${head.emoji} ${head.text}` : 'что творится на зоне за неделю'}
        </small>
      </button>
      {open && v && <PaperModal v={v} onClose={() => setOpen(false)} />}
    </>
  );
}

const RIOT_TEXT: Record<string, string> = {
  idle: 'На зоне спокойно. Пока.',
  vote: '🔥 Зона голосует за бунт!',
  fight: '🔥 Идёт бунт — ОМОН у ворот',
  won: '🔥 Бунт удался — администрация уступила',
  lost: '⛓️ Бунт подавлен, гайки закручены',
};

function PaperModal({ v, onClose }: { v: Paper; onClose(): void }) {
  const decree = v.smotr?.decree ? DECREES.find((d) => d.id === v.smotr!.decree)?.text : null;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body paper" onClick={(e) => e.stopPropagation()}>
        <div className="paper-top">
          <span>№ {v.issue}</span>
          <h2>ЗА РЕШЁТКОЙ</h2>
          <span>
            {v.weather.emoji} {v.weather.temp > 0 ? '+' : ''}
            {v.weather.temp}°
          </span>
        </div>
        <div className="paper-sub">стенгазета отряда · выходит, когда есть что сказать</div>

        <div className="paper-lead">
          <span className="paper-ill">👑</span>
          <div>
            <h3>{v.smotr ? `Смотрящий недели — ${v.smotr.name}` : 'Зона без смотрящего'}</h3>
            <p>{decree ? `Указ: ${decree}` : v.smotr ? 'Указов пока не было.' : 'Выдвигайтесь: выборы идут всю неделю.'}</p>
            {v.smotr && v.smotr.tax > 0 && <p>Налог на стройку: {v.smotr.tax}% со смены.</p>}
          </div>
        </div>

        <div className="paper-cols">
          <div>
            <h4>🏚️ Кто держит бараки</h4>
            {v.barracks.map((b) => (
              <p key={b.id}>
                {BARRACKS.find((x) => x.id === b.id)!.emoji} {b.owner ? `[${b.owner}]` : 'ничей'}
              </p>
            ))}
          </div>
          <div>
            <h4>🏗️ Стройка</h4>
            {v.build ? (
              <>
                <p>
                  {v.build.emoji} {v.build.name}
                </p>
                <div className="paper-bar">
                  <i style={{ width: `${v.build.pct}%` }} />
                </div>
                <p>
                  готово {v.build.pct}% · построено {v.built}/6
                </p>
              </>
            ) : (
              <p>Зона отстроена целиком!</p>
            )}
            <h4>🔥 Обстановка</h4>
            <p>{RIOT_TEXT[v.riot]}</p>
          </div>
        </div>

        <div className="paper-cols">
          <div>
            <h4>⚽ Кубок двора</h4>
            {v.cup.length ? v.cup.map((c, i) => <p key={i}>{['🥇', '🥈', '🥉'][i]} [{c.tag}] — {c.pts} очк.</p>) : <p>Мяч ещё не катали.</p>}
          </div>
          <div>
            <h4>🥊 Гроза двора</h4>
            {v.fighters.length ? v.fighters.map((f, i) => <p key={i}>{['🥇', '🥈', '🥉'][i]} {f.name} — {fmt(f.pts)}</p>) : <p>Тихая неделя.</p>}
          </div>
        </div>

        {v.kum.length > 0 && (
          <div className="paper-kum">
            <h4>👮 Кум зачитал вслух</h4>
            {v.kum.map((k, i) => (
              <p key={i}>
                «{malyavaById.get(k.msg)?.text ?? '…'}» — {k.from} → {k.to}
              </p>
            ))}
          </div>
        )}

        <div className="paper-chron">
          <h4>📰 Хроника недели</h4>
          {v.chron.length ? (
            v.chron.map((c, i) => (
              <p key={i}>
                <span>{c.emoji}</span> {c.text}
              </p>
            ))
          ) : (
            <p>Пока ничего громкого. Сделай так, чтобы о тебе написали.</p>
          )}
        </div>
        <button className="btn btn-wide btn-dark" onClick={onClose}>
          Свернуть газету
        </button>
      </div>
    </div>
  );
}
