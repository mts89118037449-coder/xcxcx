import { useEffect, useState } from 'react';
import { BALANCE } from '../../shared/content.ts';
import { api, tg } from '../api.ts';
import { Face } from '../art/sprites.tsx';
import { NpcBanner } from '../art/sprites.tsx';
import { Card, fmt, useGame } from '../game.tsx';

type Row = Awaited<ReturnType<typeof api.top>>['top'][number];

export function Top() {
  const { p, botUsername, toast } = useGame();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.top().then((r) => {
      setRows(r.top);
      setTotal(r.total);
    }).catch(() => setRows([]));
  }, []);

  const link = botUsername ? `https://t.me/${botUsername}?start=ref_${p.id}` : '';
  const invite = () => {
    const text = 'Заезжай ко мне на зону — поднимем авторитет вместе';
    const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg) tg.openTelegramLink(share);
    else navigator.clipboard?.writeText(link).then(() => toast('Ссылка скопирована'));
  };

  return (
    <>
      {link && (
        <Card className="glow">
          <div className="row">
            <div>
              <b>🤝 Подтяни кентов</b>
              <div className="muted small">
                Тебе и другу по {BALANCE.referralGold} 🪙 · уже подтянул: {p.refCount}
              </div>
            </div>
            <button className="btn" onClick={invite}>Позвать</button>
          </div>
        </Card>
      )}

      <NpcBanner who="avtoritet" name="Смотрящий" text="Авторитет не покупается — его делают делом. Смотри, кто тут кто" />
      <h3 className="section">Самые авторитетные · всего {fmt(total)}</h3>
      <Card>
        {!rows && <div className="muted center">Загрузка…</div>}
        <ol className="rating">
          {rows?.map((r, i) => (
            <li key={r.id} className={r.id === p.id ? 'me' : ''}>
              <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <Face face={r.face} size={30} />
              <span className="grow">
                <b>{r.name}</b>
                <small className="muted"> {r.rank} · ур. {r.level}</small>
              </span>
              <b>{fmt(r.authority)}</b>
            </li>
          ))}
        </ol>
        {rows && !rows.some((r) => r.id === p.id) && (
          <div className="muted center small">Ты на {p.place} месте</div>
        )}
      </Card>
    </>
  );
}
