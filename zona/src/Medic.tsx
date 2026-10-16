import { MEDIC } from '../shared/events.ts';
import { GOLD_PRICES } from '../shared/content.ts';
import { consumableById } from '../shared/perks.ts';
import { Place } from './art/Scenes.tsx';
import { MedicScene } from './art/PlaceScenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { fmt, lookOf, timeLeft, useGame } from './game.tsx';

/** Санчасть: койка бесплатно, укол за деньги, капельница за золото, справка — как повезёт. */
export function Medic({ onBack }: { onBack(): void }) {
  const { p, now, act, toast, say } = useGame();
  const doc = useNpc('sheet/cast/doctor');
  const hurt = p.hp < p.stats.maxHp;
  const shot = MEDIC.shotPerLevel * p.level;

  const talk = () =>
    say({
      who: 'sheet/cast/doctor',
      name: 'Лепила',
      text: hurt ? `Так, что тут у нас… ${fmt(p.hp)} из ${fmt(p.stats.maxHp)}. Жить будешь. Как лечиться будем?` : 'Здоров как бык. Хочешь справку — проси, может, и дам.',
      options: [
        {
          label: now >= p.medBedReadyAt ? `Полежать на койке (+${MEDIC.bedHeal * 100}%, бесплатно)` : `Койка занята — ${timeLeft(p.medBedReadyAt - now)}`,
          disabled: !hurt || now < p.medBedReadyAt,
          onPick: async () => {
            await act('medBed');
          },
        },
        {
          label: `Укол (+${MEDIC.shotHeal * 100}%) — ${fmt(shot)} ₽`,
          disabled: !hurt || p.money < shot,
          onPick: async () => {
            await act('medShot');
          },
        },
        {
          label: `Капельница (полностью) — ${GOLD_PRICES.heal} 🪙`,
          disabled: !hurt,
          onPick: async () => {
            if ((await act('heal')) !== null) toast('Как новенький');
          },
        },
        {
          label: p.noteReady ? 'Выпросить справку «освобождение от работ»' : 'Справку уже просил сегодня',
          disabled: !p.noteReady,
          onPick: async () => {
            const r = await act<{ ok: boolean; energy: number }>('medNote');
            if (!r) return;
            say({
              who: 'sheet/cast/doctor',
              name: 'Лепила',
              text: r.ok ? `Ладно, держи. Отдохни денёк. (+${r.energy} ⚡)` : 'Симулянт! Пошёл вон, пока на промку не отправил.',
              options: [{ label: r.ok ? 'Спасибо, доктор' : 'Эх…' }],
            });
          },
        },
        { label: 'Уйти' },
      ],
    });

  const buy = async (id: string) => {
    const c = consumableById.get(id)!;
    if (c.currency === 'gold' && !confirm(`Купить «${c.name}» за ${c.price} 🪙?`)) return;
    if ((await act('buyItem', { id, n: 1 })) !== null) toast(`${c.emoji} ${c.name} — на поясе`);
  };

  return (
    <>
      <div className="scene-wrap">
        <MedicScene>
          <Place x={146} y={232} scale={0.86}>
            <PoseG name="sit" look={lookOf(p)} />
          </Place>
          {doc && (
            <g className="npc-click" onClick={talk}>
              <Place x={300} y={262} scale={0.9}>
                <ImageG url={doc.url} height={doc.height} mirror className="char-breathe" />
              </Place>
              <g className="talk-bubble" transform={`translate(300 ${262 - doc.height * 0.9 - 8})`}>
                <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill="#f2e6c8" />
                <path d="M-3,5 L0,10 L3,5 Z" fill="#f2e6c8" />
                <text x={0} y={2} fontSize={9} textAnchor="middle">💉</text>
              </g>
            </g>
          )}
        </MedicScene>
        <div className="scene-tag">💉 Санчасть · ❤️ {fmt(p.hp)}/{fmt(p.stats.maxHp)}</div>
        <button className="place-back" onClick={onBack}>
          ← На зону
        </button>
      </div>
      <div className="muted small center">Нажми на лепилу. Койка — бесплатно, раз в {MEDIC.bedCooldownMin} мин.</div>
      <h3 className="section">Аптечка на вынос</h3>
      <div className="row gap">
        {['c_bandage', 'c_medkit'].map((id) => {
          const c = consumableById.get(id)!;
          return (
            <button key={id} className={`btn btn-wide ${c.currency === 'gold' ? 'btn-gold' : 'btn-dark'}`} onClick={() => buy(id)}>
              {c.emoji} {c.name} · {c.price} {c.currency === 'gold' ? '🪙' : '₽'} <small>(×{p.stash[id] ?? 0})</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
