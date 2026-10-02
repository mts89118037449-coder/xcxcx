import { useCallback, useEffect, useState } from 'react';
import { CLAN } from '../shared/content.ts';
import type { ClanView } from '../shared/types.ts';
import { api } from './api.ts';
import { Face, NpcBanner } from './art/sprites.tsx';
import { Card, fmt, timeLeft, useGame } from './game.tsx';
import { CLAN_BOSS, CLAN_WAR, HUT, HUT_RULES } from '../shared/clans.ts';

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
              ⬆️ Уровень клана · {fmt(c.upgradeCost)} ₽
            </button>
          )}
        </div>
      )}

      {mine && <ClanExtras c={c} owner={owner} run={run} reload={load} />}

      <ol className="rating" style={{ marginTop: 8 }}>
        {c.members.map((m) => (
          <li key={m.id} className={`clickable ${m.id === p.id ? 'me' : ''}`} onClick={() => visit(m.id)}>
            <Face face={m.face} size={38} />
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

/** Хата клана, босс дня и война кланов — только в своём клане. */
function ClanExtras({ c, owner, run, reload }: { c: ClanView; owner: boolean; run(type: string, body?: Record<string, unknown>, msg?: string): Promise<void>; reload(): void }) {
  const { p, now, busy, act, toast } = useGame();
  const [tab, setTab] = useState<'hut' | 'boss' | 'war'>('boss');
  const [hitFx, setHitFx] = useState<{ dmg: number; crit: boolean; k: number } | null>(null);
  const boss = c.boss;
  const hit = async () => {
    const r = await act<{ damage: number; crit: boolean; killed: boolean; reward: { money: number; gold: number } | null }>('clanBossHit');
    if (!r) return;
    setHitFx({ dmg: r.damage, crit: r.crit, k: Date.now() });
    if (r.killed) toast(`${CLAN_BOSS.emoji} Разобрались!${r.reward ? ` +${fmt(r.reward.money)} ₽ +${r.reward.gold} 🪙` : ''}`);
    reload();
  };
  const ready = now >= p.clanHitReadyAt;
  const prevClaimable = !!c.war && c.war.prevRank > 0 && c.war.prevRank <= CLAN_WAR.rewards.length && p.warClaimed < p.week - 1;
  return (
    <div className="clan-extras">
      <div className="chips">
        {(
          [
            ['boss', `${CLAN_BOSS.emoji} Босс дня`],
            ['hut', '🏚️ Хата клана'],
            ['war', '⚔️ Война'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'boss' && boss && (
        <div className="clan-boss">
          <b>{CLAN_BOSS.name}</b>
          <div className="clan-boss-bar">
            <div style={{ width: `${(boss.hp / boss.max) * 100}%` }} />
            <span>{boss.killed ? 'разобрались ✔' : `${fmt(boss.hp)} / ${fmt(boss.max)}`}</span>
          </div>
          {hitFx && (
            <div key={hitFx.k} className={`clan-hit ${hitFx.crit ? 'crit' : ''}`}>
              −{fmt(hitFx.dmg)}
              {hitFx.crit ? ' КРИТ' : ''}
            </div>
          )}
          <button className="btn btn-wide btn-red" disabled={busy || boss.killed || !ready || p.energy < CLAN_BOSS.energy} onClick={hit}>
            {boss.killed ? 'Завтра новые' : ready ? `🥊 Бить · ${CLAN_BOSS.energy} ⚡` : `⏳ ${timeLeft(p.clanHitReadyAt - now)}`}
          </button>
          <small className="muted">
            Бьют все свои. Добили — каждому деньги по доле урона (около {CLAN_BOSS.rationsPerMember} паек) и {CLAN_BOSS.gold} 🪙, общаку клана — доля, клану +{CLAN_WAR.points.clanBoss} очков войны.
          </small>
          {boss.top.length > 0 && (
            <ol className="clan-top">
              {boss.top.map((h, i) => (
                <li key={i}>
                  <span>{h.name}</span>
                  <b>{fmt(h.dmg)}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {tab === 'hut' && (
        <div className="hut">
          {HUT.map((h) => {
            const lvl = c.hut?.[h.id] ?? 0;
            const cost = HUT_RULES.cost(lvl);
            return (
              <div key={h.id} className="hut-row">
                <span className="hut-emoji">{h.emoji}</span>
                <div className="grow">
                  <b>
                    {h.name} <small className="muted">ур. {lvl}/{HUT_RULES.maxLevel}</small>
                  </b>
                  <small className="muted">
                    {h.per} за уровень · сейчас {lvl ? `×${lvl}` : 'нет'}
                  </small>
                </div>
                {owner && lvl < HUT_RULES.maxLevel && (
                  <button className="btn btn-s btn-gold" disabled={busy || c.treasury < cost} onClick={() => run('clanHutBuild', { hut: h.id }, `${h.emoji} ${h.name} — ур. ${lvl + 1}`)}>
                    {fmt(cost)} ₽
                  </button>
                )}
              </div>
            );
          })}
          <small className="muted">Строит главный из общака клана. Бонусы получает каждый участник.</small>
        </div>
      )}
      {tab === 'war' && c.war && (
        <div className="clan-war">
          <small className="muted">
            Очки за неделю: наезд +{CLAN_WAR.points.pvpWin}, босс +{CLAN_WAR.points.boss}, бунт +{CLAN_WAR.points.worldHit}, босс клана +{CLAN_WAR.points.clanBoss}. Топ-3 в конце недели — золото каждому ({CLAN_WAR.rewards.join('/')} 🪙) и деньги в общак.
          </small>
          <div className="muted small">Твой вклад: {p.war.week === p.week ? p.war.pts : 0}</div>
          <ol className="rating">
            {c.war.ranking.length === 0 && <li className="muted">Пока никто не набрал очков</li>}
            {c.war.ranking.map((r, i) => (
              <li key={r.id} className={r.id === c.id ? 'me' : ''}>
                <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                <span className="grow">
                  <span className="tag">[{r.tag}]</span> {r.name}
                </span>
                <b>{fmt(r.pts)}</b>
              </li>
            ))}
          </ol>
          {prevClaimable && (
            <button className="btn btn-wide btn-gold" disabled={busy} onClick={() => run('clanWarClaim', {}, `Награда за ${c.war!.prevRank} место!`)}>
              🏆 Забрать награду за прошлую неделю · {c.war.prevRank} место
            </button>
          )}
        </div>
      )}
    </div>
  );
}
