import { useCallback, useEffect, useState } from 'react';
import { VISIT } from '../shared/events.ts';
import type { VisitView } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { Stage } from './art/Stage.tsx';
import { Face } from './art/sprites.tsx';
import { itemLabel } from './Perks.tsx';
import { PARCEL } from '../shared/clans.ts';
import { MATS } from '../shared/craft.ts';
import { consumableById } from '../shared/perks.ts';
import { TradeComposer } from './Trade.tsx';
import { TRADE } from '../shared/trade.ts';
import { fmt, useGame } from './game.tsx';

type Snoop =
  | { outcome: 'caught'; hp: number; authority: number; by: 'host' | 'cat' | 'parrot' }
  | { outcome: 'empty' }
  | { outcome: 'item'; item: string }
  | { outcome: 'butts'; butts: number }
  | { outcome: 'money'; money: number };

/** Хата соседа: его отделка, мебель и он сам. id = 0 — обход бараков: случайные хаты подряд. */
export function VisitModal({ id, onClose }: { id: number; onClose(): void }) {
  const { p, act, toast, busy, say } = useGame();
  const [v, setV] = useState<VisitView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState<number[]>([]);
  const walk = id === 0;

  const load = useCallback(
    (target: number, skip: number[]) => {
      setV(null);
      setErr(null);
      api
        .visit(target, skip)
        .then((r) => {
          setV(r.visit);
          setSeen((s) => [...s.slice(-8), r.visit.id]);
        })
        .catch((e) => setErr(e instanceof ApiError ? e.message : 'Ошибка'));
    },
    [],
  );
  useEffect(() => load(id, []), [id, load]);

  const respect = async () => {
    if ((await act('respect', { id: v!.id })) === null) return;
    setV((x) => (x ? { ...x, respectedToday: true, authority: x.authority + 1 } : x));
  };
  const gift = async () => {
    if ((await act('gift', { id: v!.id })) === null) return;
    setV((x) => (x ? { ...x, giftedToday: true, authority: x.authority + 2 } : x));
  };
  const [parcelOpen, setParcelOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const sendParcel = async (kind: 'item' | 'mat', ref: string) => {
    const r = await act<{ label: string; qty: number; left: number }>('parcel', { id: v!.id, kind, ref, qty: 1 });
    if (!r) return;
    toast(`📦 ${r.label} ушёл к ${v!.name} · посылок осталось ${r.left}`);
    setParcelOpen(false);
  };
  const snoop = async () => {
    const r = await act<Snoop>('snoop', { id: v!.id });
    if (!r) return;
    const who = r.outcome === 'caught' && r.by === 'host' ? `sheet/face/${v!.face}` : 'sheet/cast/thin';
    const text =
      r.outcome === 'caught'
        ? r.by === 'cat'
          ? `Кот ${v!.name} заорал на весь барак. Хозяин прибежал и навешал. −${r.hp} ❤️, −${r.authority} 🎖️`
          : r.by === 'parrot'
            ? `Попугай заорал «ВОР-Р-Р! ВОР-Р-Р!». Прибежал хозяин. −${r.hp} ❤️, −${r.authority} 🎖️`
            : `«Ты чё в моей хате забыл?!» — ${v!.name} застал тебя с поличным. −${r.hp} ❤️, −${r.authority} 🎖️`
        : r.outcome === 'empty'
          ? 'Перерыл всё — пусто. Хозяин бедный или хитрый.'
          : r.outcome === 'item'
            ? `Под матрасом — ${itemLabel(r.item)}. Твоё.`
            : r.outcome === 'butts'
              ? `В банке из-под чая — ${r.butts} 🚬. Прибрал.`
              : `В носке заначка: ${fmt(r.money)} ₽. Тихо ушёл.`;
    say({ who, name: r.outcome === 'caught' ? v!.name : 'Шмон по-тихому', text, options: [{ label: 'Ясно' }] });
  };

  const self = v?.id === p.id;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {err && <div className="center muted">{err}</div>}
        {!v && !err && <div className="center muted">{walk ? 'Идём по бараку…' : 'Стучим в хату…'}</div>}
        {v && (
          <>
            <div className="arena">
              <Stage
                loc="cell"
                look={{ equipped: v.equipped, tattoos: v.tattoos, str: v.str, face: v.face, build: v.build, skin: v.skin }}
                mood="idle"
                furniture={v.furniture}
                interior={v.interior}
                wall={v.wall}
                anim=""
                animKey={0}
              />
            </div>
            <div className="row">
              <div className="row gap-s">
                <Face face={v.face} size={48} />
                <div>
                  <b>
                    {v.clan && <span className="tag">[{v.clan.tag}]</span>} {v.name}
                  </b>
                  <div className="muted small">
                    {v.online ? '🟢 на зоне' : '⚫ не в сети'} · {v.rank} · ур. {v.level}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid3" style={{ margin: '10px 0' }}>
              <div className="stat"><span>🎖️</span><b>{fmt(v.authority)}</b><small>авторитет</small></div>
              <div className="stat"><span>🥊</span><b>{v.wins}</b><small>побед</small></div>
              <div className="stat"><span>🛋️</span><b>{v.comfort}</b><small>уют</small></div>
            </div>
            {!self && (
              <div className="visit-acts">
                <button className="btn" disabled={busy || v.respectedToday} onClick={respect}>
                  {v.respectedToday ? '✓ Уважил' : '🤝 Уважить'}
                </button>
                <button className="btn btn-dark" disabled={busy || v.giftedToday || p.butts < VISIT.giftButts} onClick={gift}>
                  {v.giftedToday ? '✓ Подогрел' : `🚬 Подогреть · ${VISIT.giftButts}`}
                </button>
                <button className="btn btn-red" disabled={busy || p.snoopsLeft <= 0} onClick={snoop}>
                  🫳 Пошарить · {p.snoopsLeft}
                </button>
                <button className="btn btn-dark" disabled={busy || p.parcelsLeft <= 0 || p.level < PARCEL.minLevel} onClick={() => setParcelOpen(!parcelOpen)}>
                  📦 Грев посылкой · {p.parcelsLeft}
                </button>
                <button className="btn btn-dark" disabled={busy || p.level < TRADE.minLevel || v.level < TRADE.minLevel} onClick={() => setTradeOpen(true)}>
                  🔄 Обмен
                </button>
              </div>
            )}
            {tradeOpen && !self && <TradeComposer to={{ id: v.id, name: v.name }} onClose={() => setTradeOpen(false)} />}
            {parcelOpen && !self && (
              <div className="parcel-pick">
                <small className="muted">Что отправить? По одной штуке, {PARCEL.perDay} посылки в день.</small>
                <div className="sell-grid">
                  {Object.entries(p.stash)
                    .filter(([, n]) => n > 0)
                    .map(([ref, n]) => (
                      <button key={ref} className="sell-tile" disabled={busy} onClick={() => sendParcel('item', ref)} title={itemLabel(ref)}>
                        <span className="lot-emoji">{consumableById.get(ref)?.emoji}</span>
                        <i>{n}</i>
                      </button>
                    ))}
                  {MATS.filter((m) => (p.mats[m.id] ?? 0) > 0).map((m) => (
                    <button key={m.id} className="sell-tile" disabled={busy} onClick={() => sendParcel('mat', m.id)} title={m.name}>
                      <span className="lot-emoji">{m.emoji}</span>
                      <i>{p.mats[m.id]}</i>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {walk && (
              <button className="btn btn-wide" style={{ marginTop: 8 }} onClick={() => load(0, seen)}>
                🚪 В следующую хату
              </button>
            )}
            <button className="btn btn-wide btn-dark" style={{ marginTop: 8 }} onClick={onClose}>
              Выйти из хаты
            </button>
          </>
        )}
      </div>
    </div>
  );
}
