import { useEffect, useState } from 'react';
import { STAR_PACKS, itemById, packById, type StarPack } from '../shared/content.ts';
import { consumableById } from '../shared/perks.ts';
import { COSMETICS, PASS, cosmeticById, passReward, type PassReward } from '../shared/season.ts';
import { api } from './api.ts';
import { Face } from './art/sprites.tsx';
import { Card, Price, fmt, timeLeft, useGame } from './game.tsx';

import { frameClass, titleOf } from './cosmetic.ts';
export { frameClass, titleOf };

function rewardIcon(r: PassReward): { icon: string; text: string } {
  if (r.gear) return { icon: itemById.get(r.gear)?.emoji ?? '🎖️', text: itemById.get(r.gear)?.name ?? '' };
  if (r.cosmetic) return { icon: cosmeticById.get(r.cosmetic)?.kind === 'frame' ? '🖼️' : '🏷️', text: cosmeticById.get(r.cosmetic)?.name ?? '' };
  if (r.chifir) return { icon: '☕', text: `${r.chifir} чифира` };
  if (r.item) return { icon: consumableById.get(r.item)?.emoji ?? '🎁', text: consumableById.get(r.item)?.name ?? '' };
  if (r.gold) return { icon: '🪙', text: `${r.gold}` };
  if (r.mats) return { icon: '🧵', text: `${r.mats} материала` };
  if (r.butts) return { icon: '🚬', text: `${r.butts}` };
  return { icon: '💰', text: `${r.rations} паек` };
}

/** Сезон: тема месяца, пропуск на 30 уровней, предложение дня, косметика и рейтинг. */
export function SeasonPanel({ buy, pending }: { buy(p: StarPack): void; pending: string | null }) {
  const { p, now, act, busy, toast } = useGame();
  const s = p.season;
  const lvl = Math.min(PASS.levels, Math.floor(s.pts / PASS.perLevel));
  const [top, setTop] = useState<Awaited<ReturnType<typeof api.season>>['top'] | null>(null);
  useEffect(() => {
    api.season().then((r) => setTop(r.top)).catch(() => setTop([]));
  }, [s.pts]);
  const claim = async (level: number, paid: boolean) => {
    const r = await act<PassReward & { money: number }>('seasonClaim', { level, paid });
    if (r) toast(`🎁 ${rewardIcon(r).icon} ${rewardIcon(r).text}${r.gold && !r.cosmetic && !r.gear ? '' : r.gold ? ` + ${r.gold} 🪙` : ''}`);
  };
  const passPack = packById.get('season_pass')!;
  const offer = packById.get(p.offer.id);
  const cosPacks = STAR_PACKS.filter((x) => x.cosmetic);
  const wear = (kind: 'frame' | 'title', id: string) => act('wear', { kind, id });

  return (
    <>
      <div className="season-head">
        <span className="season-emoji">{s.emoji}</span>
        <div className="grow">
          <small>Сезон месяца · ещё {timeLeft(s.endsAt - now)}</small>
          <b>{s.name}</b>
          <small className="muted">
            {s.desc} За {s.focus} — очки ×2.
          </small>
        </div>
      </div>
      <div className="season-bar">
        <div style={{ width: `${((s.pts % PASS.perLevel) / PASS.perLevel) * 100}%` }} />
        <span>
          уровень {lvl}/{PASS.levels} · {fmt(s.pts)} очков
        </span>
      </div>
      <div className="pass hscroll">
        {Array.from({ length: PASS.levels }, (_, i) => {
          const L = i + 1;
          const open = lvl >= L;
          const free = rewardIcon(passReward(L, false));
          const paid = rewardIcon(passReward(L, true));
          const gotF = s.free.includes(L);
          const gotP = s.paid.includes(L);
          return (
            <div key={L} className={`pass-col ${open ? 'open' : ''} ${L % 10 === 0 ? 'big' : ''}`}>
              <small>{L}</small>
              <button className={`pass-cell free ${gotF ? 'got' : ''}`} disabled={busy || !open || gotF} onClick={() => claim(L, false)} title={free.text}>
                <span>{free.icon}</span>
                <i>{gotF ? '✓' : free.text}</i>
              </button>
              <button className={`pass-cell paid ${gotP ? 'got' : ''} ${s.pass ? '' : 'locked'}`} disabled={busy || !open || gotP || !s.pass} onClick={() => claim(L, true)} title={paid.text}>
                <span>{paid.icon}</span>
                <i>{gotP ? '✓' : s.pass ? paid.text : '🔒'}</i>
              </button>
            </div>
          );
        })}
      </div>
      {!s.pass && (
        <Card className="premium">
          <div className="row">
            <div className="grow">
              <b>🎟️ {passPack.title}</b>
              <div className="muted small">{passPack.description}</div>
            </div>
            <button className="btn btn-gold" disabled={pending !== null} onClick={() => buy(passPack)}>
              {pending === passPack.id ? '…' : <Price amount={passPack.stars} currency="stars" />}
            </button>
          </div>
        </Card>
      )}

      {offer && (
        <Card className="offer">
          <div className="row">
            <div className="grow">
              <small className="offer-tag">⏳ Предложение дня{offer.badge ? ` · ${offer.badge}` : ''}</small>
              <b>{offer.title}</b>
              <div className="muted small">{offer.description}</div>
            </div>
            <button className="btn btn-gold" disabled={pending !== null || p.offer.bought} onClick={() => buy(offer)}>
              {p.offer.bought ? '✓ Взял' : pending === offer.id ? '…' : <Price amount={offer.stars} currency="stars" />}
            </button>
          </div>
        </Card>
      )}

      <h3 className="section">Косметика</h3>
      <div className="cosmetics">
        {COSMETICS.map((c) => {
          const has = p.cosmetics.includes(c.id);
          const pack = cosPacks.find((x) => x.cosmetic === c.id);
          const on = p.frame === c.id || p.title === c.id;
          return (
            <div key={c.id} className={`cos ${has ? 'has' : ''} ${on ? 'on' : ''}`}>
              {c.kind === 'frame' ? (
                <div className={`cos-frame ${frameClass(c.id)}`}>
                  <Face face={p.face} size={44} />
                </div>
              ) : (
                <div className="cos-title">«{c.value}»</div>
              )}
              <small>{c.name}</small>
              {has ? (
                <button className="btn btn-s btn-dark" disabled={busy} onClick={() => wear(c.kind, on ? '' : c.id)}>
                  {on ? 'Снять' : 'Надеть'}
                </button>
              ) : pack ? (
                <button className="btn btn-s btn-gold" disabled={pending !== null} onClick={() => buy(pack)}>
                  {pending === pack.id ? '…' : <Price amount={pack.stars} currency="stars" />}
                </button>
              ) : (
                <small className="muted">в пропуске</small>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="section">Рейтинг сезона</h3>
      <Card>
        {!top && <div className="muted center">Загрузка…</div>}
        {top?.length === 0 && <div className="muted center">Пока пусто — будь первым</div>}
        <ol className="rating">
          {top?.map((r, i) => (
            <li key={r.id} className={r.id === p.id ? 'me' : ''}>
              <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <span className={`mini-frame ${frameClass(r.frame)}`}>
                <Face face={r.face} size={30} />
              </span>
              <span className="grow">{r.name}</span>
              <b>{fmt(r.pts)}</b>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
