// Колонии: со второй ходки можно уехать на другую зону — свои правила, боссы и место.

export type ColonyId = 'general' | 'north' | 'krytka' | 'red';

export interface ColonyFx {
  /** деньги со смен */
  jobMoney?: number;
  /** скорость восстановления энергии */
  energy?: number;
  /** авторитет за бои */
  authority?: number;
  /** добыча в наездах */
  pvpLoot?: number;
  /** случаи — чаще во столько раз */
  events?: number;
  /** репутация у сил зоны */
  rep?: Partial<Record<'brat' | 'work' | 'admin', number>>;
  /** вечная зима */
  winter?: boolean;
}

export interface ColonyDef {
  id: ColonyId;
  name: string;
  emoji: string;
  desc: string;
  /** плюсы и минусы коротко — для выбора */
  pros: string[];
  cons: string[];
  fx: ColonyFx;
}

export const COLONIES: ColonyDef[] = [
  {
    id: 'general',
    name: 'Общий режим',
    emoji: '🏚️',
    desc: 'Своя зона: всё знакомо, всё по-старому.',
    pros: ['все привычные боссы и места'],
    cons: [],
    fx: {},
  },
  {
    id: 'north',
    name: 'Северная колония',
    emoji: '🌲',
    desc: 'Лесоповал за полярным кругом. Мороз круглый год, зато платят как нигде.',
    pros: ['смены платят ×1.3', 'место «Лесоповал»', 'свои боссы: Бригадир, Начальник лагпункта'],
    cons: ['энергия восстанавливается медленнее (×0.85)', 'вечная зима: бежать труднее, в ШИЗО холодно'],
    fx: { jobMoney: 1.3, energy: 0.85, winter: true },
  },
  {
    id: 'krytka',
    name: 'Крытка',
    emoji: '🧱',
    desc: 'Крытая тюрьма: камеры, коридоры, без неба. Жёстко, но уважают сильных.',
    pros: ['авторитет за бои ×1.3', 'в наездах берут больше (×1.25)', 'место «Камера»', 'свои боссы: Пахан, Корпусной'],
    cons: ['случаи вдвое чаще — и не все к добру', 'смены платят меньше (×0.9)'],
    fx: { authority: 1.3, pvpLoot: 1.25, events: 2, jobMoney: 0.9 },
  },
  {
    id: 'red',
    name: 'Красная зона',
    emoji: '🚩',
    desc: 'Режим держит администрация. Активистам — почёт, блатным — тяжело.',
    pros: ['репутация у администрации ×2', 'смены платят ×1.15', 'место «Плац»', 'свои боссы: Председатель СДП, Подполковник'],
    cons: ['репутация у братвы ×0.5', 'в наездах берут меньше (×0.8)'],
    fx: { rep: { admin: 2, brat: 0.5 }, jobMoney: 1.15, pvpLoot: 0.8 },
  },
];

export const colonyById = new Map(COLONIES.map((c) => [c.id, c]));
export const colonyFx = (id: string | null | undefined): ColonyFx => colonyById.get((id ?? 'general') as ColonyId)?.fx ?? {};
