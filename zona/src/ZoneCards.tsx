import { useState } from 'react';
import { CARD_SET, RARITY_NAME, ZONE_CARDS, cardById } from '../shared/cards.ts';
import { ModalHead } from './Nav.tsx';
import { NpcPortrait } from './art/sprites.tsx';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

/** Карточка в профиле: сколько собрано и бесплатная пачка дня. */
export function ZoneCardsCard() {
  const { p } = useGame();
  const [open, setOpen] = useState(false);
  const have = ZONE_CARDS.filter((c) => (p.zcards[c.id] ?? 0) > 0).length;
  return (
    <>
      <button className={`pen-card ${!p.cardToday ? 'ready' : ''}`} onClick={() => setOpen(true)}>
        <span className="pen-ico">🃏</span>
        <span className="grow">
          <b>Типажи зоны</b>
          <small>{!p.cardToday ? 'Бесплатная пачка ждёт' : `Собрано ${have} из ${ZONE_CARDS.length}`}</small>
        </span>
        <i>▸</i>
      </button>
      {open && <CardsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CardsModal({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [fresh, setFresh] = useState<string | null>(null);
  const all = ZONE_CARDS.every((c) => (p.zcards[c.id] ?? 0) > 0);
  const pack = async () => {
    const r = await act<{ id: string; count: number }>('cardDaily');
    if (!r) return;
    setFresh(r.id);
    play(cardById.get(r.id)!.rarity === 'legend' ? 'level' : 'card');
  };
  const card = fresh ? cardById.get(fresh) : null;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="🃏 Типажи зоны" />
        {card && (
          <div className={`zcard big r-${card.rarity}`} onClick={() => setFresh(null)}>
            <NpcPortrait who={card.who} />
            <b>{card.name}</b>
            <i>«{card.quote}»</i>
            <small>{RARITY_NAME[card.rarity]} · у тебя {p.zcards[card.id]}</small>
          </div>
        )}
        <button className="btn btn-wide btn-gold" disabled={busy || p.cardToday} onClick={pack}>
          {p.cardToday ? 'Пачка завтра' : '🎁 Вскрыть бесплатную пачку'}
        </button>
        {all && !p.cardsDone && (
          <button className="btn btn-wide" disabled={busy} onClick={() => act('cardsClaim')} style={{ marginTop: 6 }}>
            🏆 Коллекция собрана · {CARD_SET.gold} 🪙
          </button>
        )}
        <p className="muted small">Дубли можно дарить: зайди к игроку в гости → «🃏 Подарить».</p>
        <div className="zcards">
          {ZONE_CARDS.map((c) => {
            const n = p.zcards[c.id] ?? 0;
            return (
              <div key={c.id} className={`zcard r-${c.rarity} ${n ? '' : 'none'}`}>
                {n ? <NpcPortrait who={c.who} /> : <span className="zq">?</span>}
                <b>{n ? c.name : '???'}</b>
                {n > 1 && <em>×{n}</em>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Подарить дубль другому игроку (из гостей). */
export function CardGift({ to, onDone }: { to: number; onDone(): void }) {
  const { p, act, busy, toast } = useGame();
  const dups = ZONE_CARDS.filter((c) => (p.zcards[c.id] ?? 0) > 1);
  if (!dups.length) return <p className="muted small">Дублей нет — дарить нечего.</p>;
  return (
    <div className="zcards">
      {dups.map((c) => (
        <button
          key={c.id}
          className={`zcard r-${c.rarity}`}
          disabled={busy}
          onClick={async () => {
            if (await act('cardGive', { to, id: c.id })) {
              toast(`🃏 Подарил «${c.name}»`);
              onDone();
            }
          }}
        >
          <NpcPortrait who={c.who} />
          <b>{c.name}</b>
          <em>×{p.zcards[c.id]}</em>
        </button>
      ))}
    </div>
  );
}
