import { useState } from 'react';
import { FACTIONS, OBSHAK, REP_THRESHOLDS, repRank } from '../shared/factions.ts';
import { mastById } from '../shared/term.ts';
import { NpcPortrait } from './art/sprites.tsx';
import { fmt, timeLeft, useGame } from './game.tsx';

/** Силы зоны: братва, работяги, администрация — звание, прогресс, что даёт. */
export function FactionCards() {
  const { p } = useGame();
  return (
    <div className="factions">
      {FACTIONS.map((f) => {
        const rep = p.rep[f.id];
        const r = repRank(rep);
        const lo = REP_THRESHOLDS[r];
        const hi = REP_THRESHOLDS[r + 1];
        const pct = hi ? ((rep - lo) / (hi - lo)) * 100 : 100;
        const fav = !!p.mast && f.mast.includes(p.mast);
        return (
          <div key={f.id} className={`faction f-${f.id}`}>
            <NpcPortrait who={f.who} className="faction-pic" />
            <div className="grow">
              <div className="faction-head">
                <b>
                  {f.emoji} {f.name}
                </b>
                <span className="faction-rank">{f.ranks[r]}</span>
              </div>
              <div className="faction-bar">
                <div style={{ width: `${pct}%` }} />
                <span>{hi ? `${rep} / ${hi}` : `${rep} · максимум`}</span>
              </div>
              <small>
                +{r * f.perRank.pct}% {f.perRank.label}
                {r >= 3 ? ` · ✓ ${f.rank3}` : ` · с «${f.ranks[3]}»: ${f.rank3}`}
              </small>
              <small className="muted">
                Растёт: {f.how}
                {fav && ` · ${mastById.get(p.mast!)!.emoji} ×1.5`}
                {f.rival && ` · злит: ${FACTIONS.find((x) => x.id === f.rival)!.name.toLowerCase()}`}
              </small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Воровской общак: один на всю зону. Уделяют все, помогает — своим. */
export function ObshakCard() {
  const { p, now, act, busy, toast } = useGame();
  const [n, setN] = useState(OBSHAK.minGive);
  const ration = 30 + p.level * 15;
  const ob = p.obshak;
  const close = repRank(p.rep.brat) >= 3;
  const ready = now >= ob.askReadyAt;

  const give = async () => {
    const r = await act<{ money: number; rep: number; authority: number }>('obshakGive', { rations: n });
    if (r) toast(`🃏 Уделил ${fmt(r.money)} ₽ · братва +${r.rep}${r.authority ? ` · 🎖️ +${r.authority}` : ''}`);
  };
  const ask = async () => {
    const r = await act<{ money: number }>('obshakAsk');
    if (r) toast(`🃏 Общак помог: +${fmt(r.money)} ₽`);
  };

  return (
    <div className="obshak">
      <div className="obshak-head">
        <span className="obshak-pot">💰</span>
        <div className="grow">
          <b>Воровской общак</b>
          <small className="muted">Один на всю зону. Уделяешь — растёшь у братвы. Близким — помощь раз в сутки.</small>
        </div>
        <div className="obshak-total">{fmt(ob.total)} ₽</div>
      </div>
      <div className="obshak-give">
        {[2, 5, 10, 25].map((k) => (
          <button key={k} className={`chip ${n === k ? 'active' : ''}`} onClick={() => setN(k)}>
            {k} пайки
            <small>{fmt(k * ration)} ₽</small>
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn grow" disabled={busy || p.money < n * ration} onClick={give}>
          Уделить {fmt(n * ration)} ₽
        </button>
        <button className="btn btn-dark" disabled={busy || !close || !ready || ob.total <= 0} onClick={ask}>
          {!close ? '🔒 Помощь' : ready ? 'Попросить' : `⏳ ${timeLeft(ob.askReadyAt - now)}`}
        </button>
      </div>
      {ob.log.length > 0 && (
        <div className="obshak-log">
          {ob.log.slice(0, 6).map((l, i) => (
            <div key={i}>
              <span>{l.name}</span>
              <b>+{fmt(l.amount)} ₽</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
