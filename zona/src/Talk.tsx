import { GOLD_PRICES, JOBS, TRADES } from '../shared/content.ts';
import { JOKES } from '../shared/jokes.ts';
import { fmt, useGame, type DialogSpec } from './game.tsx';
import { usePvp } from './game.tsx';

export type TalkKind = 'lyoha' | 'ded' | 'amba' | 'smoker' | 'worker' | 'coverall' | 'baryga' | 'medic' | 'turnik';

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const DED_TIPS = [
  ...JOKES.ded,
  'Лёха в напёрстки играет честно. Почти.',
  'Хату обустрой — и спится лучше, и народ уважает. И хоронить приятнее.',
  'Кто с кентами в клане — тому и энергии больше, и денег. И поминать есть кому.',
];

/** Разговоры с персонажами в сценах вместо пунктов меню. */
export function useTalk() {
  const { p, now, act, toast, say, go, openShells, openPlace } = useGame();
  const pvp = usePvp();
  const job = [...JOBS].reverse().find((j) => j.minLevel <= p.level)!;

  return (kind: TalkKind) => {
    if (kind === 'turnik') return openPlace('pullups');
    const specs: Record<Exclude<TalkKind, 'turnik'>, () => DialogSpec> = {
      lyoha: () => ({
        who: 'sheet/rival/3',
        name: 'Лёха-напёрсточник',
        text: pick(JOKES.lyoha),
        options: [
          { label: `Сыграть (осталось ${p.shellsLeft})`, onPick: openShells, disabled: p.shellsLeft <= 0 },
          { label: 'Потом' },
        ],
      }),
      ded: () => ({
        who: 'sheet/cast/ushanka',
        name: 'Дед Митрич',
        text: now >= p.dailyReadyAt ? 'Тебе, молодой, грев с воли передали. Иди распишись у адвоката.' : pick(DED_TIPS),
        options: [
          ...(now >= p.dailyReadyAt
            ? [{ label: 'Забрать грев', onPick: async () => { await act('daily'); } }]
            : []),
          { label: 'Ещё что скажешь?', onPick: () => say({ ...specs.ded(), text: pick(DED_TIPS) }) },
          { label: 'Бывай, дед' },
        ],
      }),
      amba: () => ({
        who: 'sheet/rival/1',
        name: 'Амбал',
        text: pick(JOKES.amba),
        options: [
          { label: 'Наехать (⚡10)', onPick: pvp, disabled: now < p.pvpReadyAt },
          { label: 'Отойти' },
        ],
      }),
      smoker: () => ({
        who: 'sheet/rival/5',
        name: 'Курила',
        text: `${pick(JOKES.smoker)} Бычков у тебя ${p.butts} — барыга на зоне меняет на чифир и золото.`,
        options: [{ label: 'Пойти на зону', onPick: () => go('zone') }, { label: 'Ага' }],
      }),
      worker: () => ({
        who: 'sheet/cast/worker',
        name: 'Бригадир промки',
        text: `${pick(JOKES.worker)} ${job.name} — ${fmt(job.money[0])}–${fmt(job.money[1])} ₽.`,
        options: [
          {
            label: `Отработать (⚡${job.energy})`,
                        onPick: async () => {
              const r = await act<{ bonus: boolean }>('job', { jobId: job.id });
              if (r?.bonus) toast('💰 Премия ×2!');
            },
          },
          { label: 'Позже' },
        ],
      }),
      coverall: () => ({
        who: 'sheet/rival/4',
        name: 'Молодой',
        text: pick(JOKES.coverall),
        options: [{ label: 'Ясно' }],
      }),
      baryga: () => ({
        who: 'sheet/cast/sport',
        name: 'Барыга Сеня',
        text: `${pick(JOKES.baryga)} Вижу — ${p.butts} 🚬.`,
        options: [
          ...TRADES.map((t) => ({
            label: `${t.label}${t.id === 'money' ? ` (+${fmt(40 + p.level * 10)} ₽)` : ''} — ${t.cost} 🚬`,
            disabled: p.butts < t.cost,
            tut: t.id === 'money' && p.butts >= t.cost ? 'trade' : undefined,
            onPick: async () => {
              await act('trade', { offer: t.id });
            },
          })),
          { label: 'Не сейчас' },
        ],
      }),
      medic: () => ({
        who: 'sheet/cast/doctor',
        name: 'Лепила',
        text: p.hp < p.stats.maxHp ? `Опять разукрасили? ${p.hp}/${p.stats.maxHp}. Заштопаю — ${GOLD_PRICES.heal} 🪙.` : pick(JOKES.medic),
        options: [
          ...(p.hp < p.stats.maxHp
            ? [{ label: `Подлечиться (${GOLD_PRICES.heal} 🪙)`, onPick: async () => { if ((await act('heal')) !== null) toast('Как новенький'); } }]
            : []),
          { label: 'Уйти' },
        ],
      }),
    };
    say(specs[kind]());
  };
}
