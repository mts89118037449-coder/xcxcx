import { GOLD_PRICES, JOBS, TRADES } from '../shared/content.ts';
import { fmt, useGame, type DialogSpec } from './game.tsx';
import { usePvp } from './screens/Fight.tsx';

export type TalkKind = 'lyoha' | 'ded' | 'amba' | 'smoker' | 'worker' | 'coverall' | 'baryga' | 'medic';

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const DED_TIPS = [
  'На зоне три правила: не верь, не бойся, не проси. Остальное — по ходу.',
  'Бычки по двору собирай — барыга за них и чифир даст, и золотишко.',
  'Лёха в напёрстки играет честно. Почти.',
  'Хату обустрой — и спится лучше, и народ уважает.',
  'Кто с кентами в клане — тому и энергии больше, и денег.',
];

/** Разговоры с персонажами в сценах вместо пунктов меню. */
export function useTalk() {
  const { p, now, act, toast, say, go, openShells } = useGame();
  const pvp = usePvp();
  const job = [...JOBS].reverse().find((j) => j.minLevel <= p.level)!;

  return (kind: TalkKind) => {
    const specs: Record<TalkKind, () => DialogSpec> = {
      lyoha: () => ({
        who: 'sheet/rival/3',
        name: 'Лёха-напёрсточник',
        text: pick(['О, сосед! Сыграем? Угадаешь шарик — заберёшь почти втрое.', 'Скучно в хате… Давай в напёрстки, по-маленькой?']),
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
            ? [{ label: 'Забрать грев', onPick: async () => { const r = await act<{ money: number; gold: number }>('daily'); if (r) toast(`Грев: +${fmt(r.money)} ₽, +${r.gold} 🪙`); } }]
            : []),
          { label: 'Ещё что скажешь?', onPick: () => say({ ...specs.ded(), text: pick(DED_TIPS) }) },
          { label: 'Бывай, дед' },
        ],
      }),
      amba: () => ({
        who: 'sheet/rival/1',
        name: 'Амбал',
        text: pick(['Чё вылупился? Проблемы?', 'Место здесь моё. Хочешь оспорить — давай.']),
        options: [
          { label: 'Наехать (⚡10)', onPick: pvp, disabled: now < p.pvpReadyAt || p.energy < 10 },
          { label: 'Отойти' },
        ],
      }),
      smoker: () => ({
        who: 'sheet/rival/5',
        name: 'Курила',
        text: `Бычков насобирал? У тебя ${p.butts}. Барыга на зоне меняет на чифир и золото.`,
        options: [{ label: 'Пойти на зону', onPick: () => go('zone') }, { label: 'Ага' }],
      }),
      worker: () => ({
        who: 'sheet/cast/worker',
        name: 'Бригадир промки',
        text: `Смена ждёт. ${job.name} — ${fmt(job.money[0])}–${fmt(job.money[1])} ₽.`,
        options: [
          {
            label: `Отработать (⚡${job.energy})`,
            disabled: p.energy < job.energy,
            onPick: async () => {
              const r = await act<{ money: number; xp: number }>('job', { jobId: job.id });
              if (r) toast(`+${fmt(r.money)} ₽, +${r.xp} опыта`);
            },
          },
          { label: 'Позже' },
        ],
      }),
      coverall: () => ({
        who: 'sheet/rival/4',
        name: 'Молодой',
        text: pick(['Начальник сегодня злой, норму подняли…', 'Говорят, в подвале подкоп роют. Только тсс.', 'Тебе поручений не надо? Внизу доска висит.']),
        options: [{ label: 'Ясно' }],
      }),
      baryga: () => ({
        who: 'sheet/cast/sport',
        name: 'Барыга Сеня',
        text: `Бычки есть? Вижу — ${p.butts}. Чем богат, тем и рад.`,
        options: [
          ...TRADES.map((t) => ({
            label: `${t.label}${t.id === 'money' ? ` (+${fmt(40 + p.level * 10)} ₽)` : ''} — ${t.cost} 🚬`,
            disabled: p.butts < t.cost,
            onPick: async () => {
              if ((await act('trade', { offer: t.id })) !== null) toast(`Барыга доволен: ${t.label.toLowerCase()}`);
            },
          })),
          { label: 'Не сейчас' },
        ],
      }),
      medic: () => ({
        who: 'sheet/cast/doctor',
        name: 'Лепила',
        text: p.hp < p.stats.maxHp ? `Опять разукрасили? ${p.hp}/${p.stats.maxHp}. Заштопаю — ${GOLD_PRICES.heal} 🪙.` : 'Здоров как бык. Иди отсюда, не мешай.',
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
