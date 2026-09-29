import { useEffect, useState } from 'react';
import { itemById } from '../shared/content.ts';
import { MATS, matById, type MatId } from '../shared/craft.ts';
import { consumableById } from '../shared/perks.ts';
import { api, type MarketLot } from './api.ts';
import { ItemIcon } from './art/Icons.tsx';
import { fmt, useGame } from './game.tsx';

type Kind = MarketLot['kind'];

function goods(kind: Kind, ref: string): { emoji: string; name: string } {
  if (kind === 'mat') {
    const m = matById.get(ref as MatId);
    return { emoji: m?.emoji ?? '❔', name: m?.name ?? ref };
  }
  if (kind === 'item') {
    const c = consumableById.get(ref);
    return { emoji: c?.emoji ?? '❔', name: c?.name ?? ref };
  }
  const i = itemById.get(ref);
  return { emoji: i?.emoji ?? '❔', name: i?.name ?? ref };
}

function GoodsIcon({ kind, refId }: { kind: Kind; refId: string }) {
  return kind === 'gear' ? <ItemIcon id={refId} size={40} /> : <span className="lot-emoji">{goods(kind, refId).emoji}</span>;
}

/** Барахолка: лоты игроков. Покупаешь — деньги продавцу, 5% на общак. */
export function Market() {
  const { p, act, busy, toast } = useGame();
  const [lots, setLots] = useState<MarketLot[] | null>(null);
  const [filter, setFilter] = useState<'all' | Kind | 'mine'>('all');
  const [sell, setSell] = useState<{ kind: Kind; ref: string; max: number } | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const ration = 30 + p.level * 15;

  const load = () => api.market().then((r) => setLots(r.lots)).catch(() => setLots([]));
  useEffect(() => {
    load();
  }, []);

  const buy = async (l: MarketLot) => {
    if (!confirm(`Купить «${goods(l.kind, l.ref).name}» ×${l.qty} за ${fmt(l.price)} ₽?`)) return;
    if ((await act('lotBuy', { id: l.id })) !== null) toast(`🛒 ${goods(l.kind, l.ref).name} — твоё`);
    load();
  };
  const take = async (l: MarketLot) => {
    if ((await act('lotTake', { id: l.id })) !== null) toast('Снял с прилавка');
    load();
  };
  const put = async () => {
    if (!sell) return;
    const pr = Math.floor(Number(price));
    if (!(pr >= 1)) return toast('Назови цену', 'err');
    if ((await act('lotPut', { kind: sell.kind, ref: sell.ref, qty, price: pr })) !== null) {
      toast('📦 Выставлено на барахолку');
      setSell(null);
      load();
    }
  };

  // что есть на продажу: расходники, материалы, неснятый шмот
  const equipped = new Set(Object.values(p.equipped));
  const mine: { kind: Kind; ref: string; n: number }[] = [
    ...Object.entries(p.stash)
      .filter(([, n]) => n > 0)
      .map(([ref, n]) => ({ kind: 'item' as const, ref, n })),
    ...MATS.filter((m) => (p.mats[m.id] ?? 0) > 0).map((m) => ({ kind: 'mat' as const, ref: m.id, n: p.mats[m.id]! })),
    ...p.inventory.filter((id) => !equipped.has(id)).map((ref) => ({ kind: 'gear' as const, ref, n: 1 })),
  ];

  const shown = (lots ?? []).filter((l) => (filter === 'all' ? true : filter === 'mine' ? l.seller_id === p.id : l.kind === filter));

  return (
    <>
      <div className="market-head">
        <b>🛒 Барахолка</b>
        <small className="muted">Торгуй с зэками: расходники, материалы, шмот. С каждой сделки 5% — на общак.</small>
      </div>
      <div className="chips">
        {(
          [
            ['all', 'Все'],
            ['item', 'Расходники'],
            ['mat', 'Материалы'],
            ['gear', 'Шмот'],
            ['mine', 'Мои'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="lots">
        {lots === null && <div className="muted small center">Загружаю…</div>}
        {lots && !shown.length && <div className="muted small center">Пусто. Выстави что-нибудь первым.</div>}
        {shown.map((l) => {
          const g = goods(l.kind, l.ref);
          const own = l.seller_id === p.id;
          return (
            <div key={l.id} className={`lot ${own ? 'own' : ''}`}>
              <div className="lot-ico">
                <GoodsIcon kind={l.kind} refId={l.ref} />
                {l.qty > 1 && <i>×{l.qty}</i>}
              </div>
              <div className="grow">
                <b>{g.name}</b>
                <small className="muted">{own ? 'твой лот' : `продаёт ${l.seller_name}`}</small>
              </div>
              {own ? (
                <button className="btn btn-s btn-dark" disabled={busy} onClick={() => take(l)}>
                  Снять
                </button>
              ) : (
                <button className="btn btn-s" disabled={busy || p.money < l.price} onClick={() => buy(l)}>
                  {fmt(l.price)} ₽
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="section">Выставить своё</h3>
      {sell ? (
        <div className="lot-form">
          <div className="row">
            <div className="lot-ico">
              <GoodsIcon kind={sell.kind} refId={sell.ref} />
            </div>
            <b className="grow">{goods(sell.kind, sell.ref).name}</b>
            <button className="btn btn-s btn-dark" onClick={() => setSell(null)}>
              ✕
            </button>
          </div>
          {sell.max > 1 && (
            <div className="row lot-qty">
              <span>Штук</span>
              <button className="btn btn-s btn-dark" onClick={() => setQty(Math.max(1, qty - 1))}>
                −
              </button>
              <b>{qty}</b>
              <button className="btn btn-s btn-dark" onClick={() => setQty(Math.min(sell.max, qty + 1))}>
                +
              </button>
            </div>
          )}
          <div className="row lot-qty">
            <span>Цена ₽</span>
            <input className="input grow" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="за всё" />
          </div>
          <div className="chips">
            {[1, 3, 10].map((k) => (
              <button key={k} onClick={() => setPrice(String(k * ration * qty))}>
                {k} пайк{k === 1 ? 'а' : k < 5 ? 'и' : ''} за шт.
              </button>
            ))}
          </div>
          <button className="btn btn-wide" disabled={busy} onClick={put}>
            Выставить{price ? ` за ${fmt(Number(price))} ₽` : ''}
          </button>
        </div>
      ) : (
        <div className="sell-grid">
          {!mine.length && <div className="muted small">Продавать нечего.</div>}
          {mine.map((m) => (
            <button
              key={`${m.kind}:${m.ref}`}
              className="sell-tile"
              onClick={() => {
                setSell({ kind: m.kind, ref: m.ref, max: m.n });
                setQty(1);
                setPrice('');
              }}
            >
              <GoodsIcon kind={m.kind} refId={m.ref} />
              {m.n > 1 && <i>{m.n}</i>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
