import { useEffect, useState } from 'react';
import { TRADE, type TradeKind, type TradeLine } from '../shared/trade.ts';
import { CONSUMABLES, consumableById } from '../shared/perks.ts';
import { MATS, matById, type MatId } from '../shared/craft.ts';
import { itemById } from '../shared/content.ts';
import { api, type TradeView } from './api.ts';
import { timeLeft, useGame } from './game.tsx';

export function lineLabel(l: TradeLine): string {
  const name =
    l.kind === 'item' ? `${consumableById.get(l.ref)?.emoji ?? ''} ${consumableById.get(l.ref)?.name ?? l.ref}` : l.kind === 'mat' ? `${matById.get(l.ref as MatId)?.emoji ?? ''} ${matById.get(l.ref as MatId)?.name ?? l.ref}` : `👕 ${itemById.get(l.ref)?.name ?? l.ref}`;
  return l.qty > 1 ? `${name} ×${l.qty}` : name;
}

type Opt = { kind: TradeKind; ref: string; label: string; max: number };

/** Набор одной стороны обмена: плюсики по вещам. */
function Side({ title, opts, lines, setLines }: { title: string; opts: Opt[]; lines: TradeLine[]; setLines(l: TradeLine[]): void }) {
  const qty = (o: Opt) => lines.find((l) => l.kind === o.kind && l.ref === o.ref)?.qty ?? 0;
  const set = (o: Opt, n: number) => {
    const rest = lines.filter((l) => !(l.kind === o.kind && l.ref === o.ref));
    if (n <= 0) return setLines(rest);
    if (!qty(o) && rest.length >= TRADE.maxLines) return;
    setLines([...rest, { kind: o.kind, ref: o.ref, qty: n }]);
  };
  return (
    <div className="trade-side">
      <b>{title}</b>
      <div className="trade-opts">
        {opts.map((o) => {
          const n = qty(o);
          return (
            <div key={`${o.kind}:${o.ref}`} className={`trade-opt ${n ? 'on' : ''}`}>
              <span className="grow">{o.label}</span>
              {n > 0 && (
                <button className="btn btn-s btn-dark" onClick={() => set(o, n - 1)}>
                  −
                </button>
              )}
              {n > 0 && <b>{n}</b>}
              <button className="btn btn-s btn-dark" disabled={n >= o.max} onClick={() => set(o, n + 1)}>
                +
              </button>
            </div>
          );
        })}
        {!opts.length && <div className="muted small">Нечего отдать</div>}
      </div>
    </div>
  );
}

/** Предложить обмен соседу. */
export function TradeComposer({ to, onClose }: { to: { id: number; name: string }; onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [give, setGive] = useState<TradeLine[]>([]);
  const [want, setWant] = useState<TradeLine[]>([]);
  const mine: Opt[] = [
    ...Object.entries(p.stash)
      .filter(([, n]) => n > 0)
      .map(([ref, n]) => ({ kind: 'item' as const, ref, label: lineLabel({ kind: 'item', ref, qty: 1 }), max: Math.min(n, TRADE.maxQty) })),
    ...Object.entries(p.mats)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([ref, n]) => ({ kind: 'mat' as const, ref, label: lineLabel({ kind: 'mat', ref, qty: 1 }), max: Math.min(n ?? 0, TRADE.maxQty) })),
    ...p.inventory
      .filter((id) => !Object.values(p.equipped).includes(id))
      .map((ref) => ({ kind: 'gear' as const, ref, label: lineLabel({ kind: 'gear', ref, qty: 1 }), max: 1 })),
  ];
  const catalog: Opt[] = [
    ...CONSUMABLES.map((c) => ({ kind: 'item' as const, ref: c.id, label: lineLabel({ kind: 'item', ref: c.id, qty: 1 }), max: TRADE.maxQty })),
    ...MATS.map((m) => ({ kind: 'mat' as const, ref: m.id, label: lineLabel({ kind: 'mat', ref: m.id, qty: 1 }), max: TRADE.maxQty })),
  ];
  const send = async () => {
    if ((await act('tradeOffer', { to: to.id, give, want })) !== null) {
      toast('Предложение отправлено — ответят в течение суток');
      onClose();
    }
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body trade" onClick={(e) => e.stopPropagation()}>
        <h2>🔄 Обмен с {to.name}</h2>
        <p className="muted small">
          Отданное лежит в залоге, пока {to.name} не ответит (сутки). Отказ — вернётся. Деньги и золото не меняются. До {TRADE.maxLines} вещей с каждой стороны, {TRADE.perDay} обменов в день.
        </p>
        <div className="trade-cols">
          <Side title="Отдаю" opts={mine} lines={give} setLines={setGive} />
          <Side title="Прошу" opts={catalog} lines={want} setLines={setWant} />
        </div>
        <button className="btn btn-wide" disabled={busy || !give.length || !want.length} onClick={send}>
          Предложить
        </button>
      </div>
    </div>
  );
}

/** Входящие и свои предложения. */
export function TradesInbox() {
  const { p, now, act, busy } = useGame();
  const [list, setList] = useState<{ trades: TradeView[]; ttlMs: number } | null>(null);
  const load = () => api.trades().then(setList).catch(() => null);
  useEffect(() => {
    load();
  }, []);
  if (!list) return null;
  const open = list.trades.filter((t) => t.status === 'open');
  if (!open.length && !list.trades.length) return null;
  const answer = async (type: string, id: number) => {
    await act(type, { id });
    load();
  };
  return (
    <div className="card trades">
      <b>🔄 Обмены</b>
      {open.map((t) => {
        const incoming = t.to_id === p.id;
        return (
          <div key={t.id} className={`trade-row ${incoming ? 'in' : 'out'}`}>
            <div>
              <small className="muted">
                {incoming ? `${t.from_name} предлагает` : `Ты → ${t.to_name}`} · ещё {timeLeft(t.created_at + list.ttlMs - now)}
              </small>
              <div>
                {incoming ? 'Тебе' : 'Отдаёшь'}: {t.give.map(lineLabel).join(', ')}
              </div>
              <div>
                {incoming ? 'Взамен' : 'Просишь'}: {t.want.map(lineLabel).join(', ')}
              </div>
            </div>
            <div className="row gap">
              {incoming && (
                <button className="btn btn-s" disabled={busy} onClick={() => answer('tradeAccept', t.id)}>
                  ✔ Меняемся
                </button>
              )}
              <button className="btn btn-s btn-dark" disabled={busy} onClick={() => answer('tradeDecline', t.id)}>
                {incoming ? 'Отказать' : 'Отменить'}
              </button>
            </div>
          </div>
        );
      })}
      {list.trades
        .filter((t) => t.status !== 'open')
        .slice(0, 3)
        .map((t) => (
          <div key={t.id} className="muted small">
            {t.status === 'done' ? '✔' : '✖'} {t.from_id === p.id ? t.to_name : t.from_name}:{' '}
            {{ done: 'обменялись', declined: 'отказ', cancelled: 'отменено', expired: 'не ответил' }[t.status as 'done']}
          </div>
        ))}
    </div>
  );
}
