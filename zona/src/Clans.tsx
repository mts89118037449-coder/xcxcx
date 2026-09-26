import { useCallback, useEffect, useState } from 'react';
import { CLAN } from '../shared/content.ts';
import type { ClanView } from '../shared/types.ts';
import { api } from './api.ts';
import { Face, NpcBanner } from './art/sprites.tsx';
import { Card, fmt, useGame } from './game.tsx';

type ClanRow = Awaited<ReturnType<typeof api.clans>>['clans'][number];

export function Clans() {
  const { p } = useGame();
  const [list, setList] = useState<ClanRow[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const reload = useCallback(() => {
    api.clans().then((r) => setList(r.clans)).catch(() => setList([]));
  }, []);
  useEffect(reload, [reload, p.clan?.id]);

  return (
    <>
      <NpcBanner who="blatnoy" name="Бригадир" text="Одному на зоне не выжить. Держись своих — и свои за тебя впишутся" />
      {p.clan ? <ClanCard id={p.clan.id} mine /> : <CreateClan />}
      <h3 className="section">Кланы зоны</h3>
      <Card>
        {!list && <div className="muted center">Загрузка…</div>}
        {list?.length === 0 && <div className="muted center">Пока ни одного клана — основай первый</div>}
        <ol className="rating">
          {list?.map((c, i) => (
            <li key={c.id} className={`clickable ${c.id === p.clan?.id ? 'me' : ''}`} onClick={() => setOpenId(openId === c.id ? null : c.id)}>
              <span className="place">{i + 1}</span>
              <span className="grow">
                <span className="tag">[{c.tag}]</span> <b>{c.name}</b>
                <small className="muted"> ур. {c.level} · {c.members}/{CLAN.maxMembers}</small>
              </span>
              <b>{fmt(c.authority)}</b>
            </li>
          ))}
        </ol>
      </Card>
      {openId !== null && openId !== p.clan?.id && <ClanCard id={openId} onChange={reload} />}
    </>
  );
}

function CreateClan() {
  const { p, act, busy, toast } = useGame();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const can = p.level >= CLAN.minLevel;
  return (
    <Card>
      <b>🏴 Основать клан</b>
      <div className="muted small">
        {fmt(CLAN.createCost)} ₽, с {CLAN.minLevel} уровня. Каждый уровень клана даёт всем участникам +{CLAN.moneyPerLevel}% денег и +
        {CLAN.energyPerLevel} к макс. энергии
      </div>
      <form
        className="row gap-s"
        style={{ marginTop: 8 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if ((await act('clanCreate', { name, tag })) !== null) toast(`Клан «${name}» основан`);
        }}
      >
        <input className="input grow" placeholder="Название" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ width: 70 }} placeholder="ТЕГ" value={tag} maxLength={4} onChange={(e) => setTag(e.target.value)} />
        <button className="btn btn-s" disabled={busy || !can || !name || !tag}>
          {can ? 'Основать' : `🔒 ${CLAN.minLevel} ур.`}
        </button>
      </form>
    </Card>
  );
}

function ClanCard({ id, mine = false, onChange }: { id: number; mine?: boolean; onChange?(): void }) {
  const { p, act, busy, toast, visit } = useGame();
  const [c, setC] = useState<ClanView | null>(null);
  const [amount, setAmount] = useState('1000');
  const load = useCallback(() => {
    api.clan(id).then((r) => setC(r.clan)).catch(() => setC(null));
  }, [id]);
  useEffect(load, [load, p.money, p.clan?.level]);
  if (!c) return <Card><div className="muted center">Загрузка…</div></Card>;
  const owner = c.ownerId === p.id;

  const run = async (type: string, body: Record<string, unknown> = {}, msg?: string) => {
    if ((await act(type, body)) === null) return;
    if (msg) toast(msg);
    load();
    onChange?.();
  };

  return (
    <Card className={mine ? 'premium' : ''}>
      <div className="row">
        <div>
          <span className="tag">[{c.tag}]</span> <b>{c.name}</b>
          <div className="muted small">
            Уровень {c.level} · бонус +{c.level * CLAN.moneyPerLevel}% ₽, +{c.level * CLAN.energyPerLevel} ⚡ · общак {fmt(c.treasury)} ₽
          </div>
        </div>
        {!mine && !p.clan && (
          <button className="btn btn-s" disabled={busy || c.members.length >= CLAN.maxMembers} onClick={() => run('clanJoin', { id: c.id }, `Ты в клане «${c.name}»`)}>
            Вступить
          </button>
        )}
      </div>

      {mine && (
        <div className="clan-actions">
          <form
            className="row gap-s"
            onSubmit={(e) => {
              e.preventDefault();
              run('clanDonate', { amount: Number(amount) }, `В общак ушло ${amount} ₽`);
            }}
          >
            <input className="input grow" type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn btn-s" disabled={busy}>💰 В общак</button>
          </form>
          {owner && c.upgradeCost !== null && (
            <button className="btn btn-wide btn-gold" disabled={busy || c.treasury < c.upgradeCost} onClick={() => run('clanUpgrade', {}, 'Клан вырос!')}>
              ⬆️ Поднять уровень · {fmt(c.upgradeCost)} ₽ из общака
            </button>
          )}
        </div>
      )}

      <ol className="rating" style={{ marginTop: 8 }}>
        {c.members.map((m) => (
          <li key={m.id} className={`clickable ${m.id === p.id ? 'me' : ''}`} onClick={() => visit(m.id)}>
            <Face face={m.face} size={28} />
            <span className="grow">
              <b>{m.name}</b>
              {m.id === c.ownerId && <small className="muted"> · главный</small>}
              <small className="muted"> · ур. {m.level}</small>
            </span>
            <b>{fmt(m.authority)}</b>
            {mine && owner && m.id !== p.id && (
              <button
                className="btn btn-s btn-dark"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Выгнать ${m.name}?`)) run('clanKick', { id: m.id });
                }}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="muted small center">Нажми на участника — зайдёшь к нему в хату</div>
      {mine && (
        <button className="btn btn-link" onClick={() => confirm('Выйти из клана?') && run('clanLeave', {}, 'Ты вышел из клана')}>
          Выйти из клана
        </button>
      )}
    </Card>
  );
}
