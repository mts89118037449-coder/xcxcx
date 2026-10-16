import { useEffect, useState } from 'react';
import { packById } from '../shared/content.ts';
import { mastById } from '../shared/term.ts';
import { chapterOf } from '../shared/story.ts';
import { api } from './api.ts';
import { fmt } from './game.tsx';

interface Stats {
  days: { day: string; active: number; fresh: number; d1: number | null; d7: number | null }[];
  churn: { level: number; n: number }[];
  introStuck: number;
  chapters: { ch: number | null; n: number }[];
  masts: { mast: string; n: number }[];
  levels: { level: number; n: number }[];
  pay: { byPack: { pack: string; n: number; stars: number }[]; week: { n: number; stars: number; payers: number }; all: { n: number; stars: number; payers: number } };
}

/** Столбики одной серии: подпись дня снизу, значение — по наведению/нажатию. */
function Bars({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="st-bars">
      {hover !== null && (
        <div className="st-tip">
          {data[hover].label}: <b>{fmt(data[hover].value)}</b> {unit}
        </div>
      )}
      <div className="st-plot">
        {data.map((d, i) => (
          <button key={i} className="st-col" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <div className="st-bar" style={{ height: `${(d.value / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="st-axis">
        <span>{data[0]?.label}</span>
        <span>макс. {fmt(max)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

const pct = (a: number | null, b: number) => (a === null ? '—' : b ? `${Math.round((a / b) * 100)}%` : '—');

/** Статистика для админа: активные, новые, удержание, где бросают, платежи. */
export function AdminStats() {
  const [s, setS] = useState<{ stats: Stats; total: number; online: number } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api
      .adminStats<{ stats: Stats; total: number; online: number }>()
      .then(setS)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Не загрузилось'));
  }, []);
  if (err) return <div className="muted center">{err}</div>;
  if (!s) return <div className="muted center">Загрузка…</div>;
  const st = s.stats;
  const today = st.days[st.days.length - 1];
  const short = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7);
  const cohorts = st.days.filter((d) => d.fresh > 0).slice(-8);
  const churnTotal = st.churn.reduce((a, b) => a + b.n, 0);
  return (
    <div className="stats">
      <div className="st-tiles">
        <div>
          <b>{fmt(s.total)}</b>
          <small>всего игроков</small>
        </div>
        <div>
          <b>{fmt(today.active)}</b>
          <small>за сегодня</small>
        </div>
        <div>
          <b>{fmt(s.online)}</b>
          <small>онлайн</small>
        </div>
        <div>
          <b>{fmt(st.pay.week.stars)} ⭐</b>
          <small>за 7 дней</small>
        </div>
      </div>

      <h3 className="section">Заходили по дням</h3>
      <Bars data={st.days.map((d) => ({ label: short(d.day), value: d.active }))} unit="игроков" />
      <h3 className="section">Новые по дням</h3>
      <Bars data={st.days.map((d) => ({ label: short(d.day), value: d.fresh }))} unit="новых" />

      <h3 className="section">Возвращаются</h3>
      <table className="st-table">
        <thead>
          <tr>
            <th>Пришли</th>
            <th>Новых</th>
            <th>На 2-й день</th>
            <th>Через неделю</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                пока нет данных
              </td>
            </tr>
          )}
          {cohorts.map((d) => (
            <tr key={d.day}>
              <td>{short(d.day)}</td>
              <td>{d.fresh}</td>
              <td>{pct(d.d1, d.fresh)}</td>
              <td>{pct(d.d7, d.fresh)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className="muted">«На 2-й день» — какая доля пришедших зашла и на следующий день.</small>

      <h3 className="section">Где бросают</h3>
      <small className="muted">
        Пришли за 30 дней и не заходят 3+ дня: {churnTotal}. Застряли во вступлении: {st.introStuck}.
      </small>
      {st.churn.length > 0 && <Bars data={st.churn.map((c) => ({ label: `${c.level} ур.`, value: c.n }))} unit="ушли на этом уровне" />}

      <h3 className="section">Сюжет и масти</h3>
      <div className="st-list">
        {st.chapters.map((c) => (
          <div key={String(c.ch)}>
            <span>{c.ch === null ? '—' : `гл. ${c.ch + 1} · ${chapterOf(c.ch, null)?.name ?? 'пройден'}`}</span>
            <b>{c.n}</b>
          </div>
        ))}
        {st.masts.map((m) => (
          <div key={m.mast}>
            <span>{m.mast === '—' ? 'без масти' : `${mastById.get(m.mast as 'blat')?.emoji} ${mastById.get(m.mast as 'blat')?.name}`}</span>
            <b>{m.n}</b>
          </div>
        ))}
      </div>

      <h3 className="section">Платежи</h3>
      <div className="st-tiles">
        <div>
          <b>{fmt(st.pay.all.stars)} ⭐</b>
          <small>всего</small>
        </div>
        <div>
          <b>{st.pay.all.payers}</b>
          <small>платили</small>
        </div>
        <div>
          <b>{st.pay.all.payers ? fmt(Math.round(st.pay.all.stars / st.pay.all.payers)) : 0} ⭐</b>
          <small>на платящего</small>
        </div>
        <div>
          <b>{s.total ? `${((st.pay.all.payers / s.total) * 100).toFixed(1)}%` : '—'}</b>
          <small>доля платящих</small>
        </div>
      </div>
      <div className="st-list">
        {st.pay.byPack.length === 0 && <div className="muted">покупок пока нет</div>}
        {st.pay.byPack.map((r) => (
          <div key={r.pack}>
            <span>
              {packById.get(r.pack)?.title ?? r.pack} · {r.n} шт.
            </span>
            <b>{fmt(r.stars)} ⭐</b>
          </div>
        ))}
      </div>
    </div>
  );
}
