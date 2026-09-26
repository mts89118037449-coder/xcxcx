import { useEffect, useState } from 'react';
import { BALANCE } from '../../shared/content.ts';
import { api, tg } from '../api.ts';
import { Face } from '../art/sprites.tsx';
import { NpcBanner } from '../art/sprites.tsx';
import { Clans } from '../Clans.tsx';
import { Card, fmt, useGame } from '../game.tsx';

type Row = Awaited<ReturnType<typeof api.top>>['top'][number];

export function Top() {
  const { p, botUsername, toast, visit } = useGame();
  const [view, setView] = useState<'top' | 'clans'>('top');
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

  const seg = (
    <div className="seg">
      <button className={view === 'top' ? 'active' : ''} onClick={() => setView('top')}>Рейтинг</button>
      <button className={view === 'clans' ? 'active' : ''} onClick={() => setView('clans')}>Кланы</button>
    </div>
  );
  if (view === 'clans') {
    return (
      <>
        {seg}
        <Clans />
      </>
    );
  }

  return (
    <>
      {seg}
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
      <div className="muted small" style={{ margin: '-4px 2px 8px' }}>Нажми на игрока — зайдёшь к нему в хату</div>
      <Card>
        {!rows && <div className="muted center">Загрузка…</div>}
        <ol className="rating">
          {rows?.map((r, i) => (
            <li key={r.id} className={`clickable ${r.id === p.id ? 'me' : ''}`} onClick={() => visit(r.id)}>
              <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <Face face={r.face} size={30} />
              <span className="grow">
                {r.tag && <span className="tag">[{r.tag}]</span>} <b>{r.name}</b>
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
