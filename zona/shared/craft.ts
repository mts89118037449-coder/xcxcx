// Ремесло: материалы с промки, кухни и передач — в расходники и талисманы, которых нет в ларьке.

export type MatId = 'thread' | 'wood' | 'wire' | 'bread' | 'ink' | 'blade' | 'cloth' | 'tea';

export const MATS: { id: MatId; name: string; emoji: string; w: number }[] = [
  { id: 'thread', name: 'Нитки', emoji: '🧵', w: 5 },
  { id: 'cloth', name: 'Тряпьё', emoji: '🧶', w: 5 },
  { id: 'wood', name: 'Обрезки', emoji: '🪵', w: 4 },
  { id: 'bread', name: 'Мякиш', emoji: '🍞', w: 4 },
  { id: 'tea', name: 'Плиточный чай', emoji: '🍵', w: 3 },
  { id: 'wire', name: 'Проволока', emoji: '🪢', w: 3 },
  { id: 'ink', name: 'Тушь', emoji: '🖋️', w: 2 },
  { id: 'blade', name: 'Лезвие', emoji: '🔪', w: 1 },
];
export const matById = new Map(MATS.map((m) => [m.id, m]));

export interface Recipe {
  id: string;
  name: string;
  minLevel: number;
  mats: Partial<Record<MatId, number>>;
  /** расходник или вещь (талисман) */
  out: { item?: string; gear?: string; n?: number };
}

export const RECIPES: Recipe[] = [
  { id: 'r_bandage', name: 'Бинт из тряпья', minLevel: 1, mats: { cloth: 2, thread: 1 }, out: { item: 'c_bandage', n: 2 } },
  { id: 'r_wraps', name: 'Обмотка на кулаки', minLevel: 1, mats: { cloth: 2 }, out: { item: 'c_wraps' } },
  { id: 'r_chifir', name: 'Крепкий чифир', minLevel: 2, mats: { tea: 3 }, out: { item: 'c_chifir' } },
  { id: 'r_book', name: 'Книга под робу', minLevel: 2, mats: { wood: 2, thread: 1 }, out: { item: 'c_book' } },
  { id: 'r_insert', name: 'Свинчатка', minLevel: 3, mats: { wire: 2, cloth: 1 }, out: { item: 'c_insert' } },
  { id: 'r_blade', name: 'Заточка', minLevel: 3, mats: { blade: 1, wood: 1, thread: 1 }, out: { item: 'c_blade' } },
  { id: 'r_spring', name: 'Пружина', minLevel: 4, mats: { wire: 3 }, out: { item: 'c_spring' } },
  { id: 'r_beads', name: 'Чётки из мякиша', minLevel: 4, mats: { bread: 4, thread: 2 }, out: { gear: 'craft_beads' } },
  { id: 'r_towel', name: 'Мокрое полотенце', minLevel: 5, mats: { cloth: 3, tea: 1 }, out: { item: 'c_towel' } },
  { id: 'r_mirror', name: 'Осколок зеркала', minLevel: 6, mats: { blade: 1, wire: 1 }, out: { item: 'c_mirror' } },
  { id: 'r_vodka', name: 'Самогон на хлебе', minLevel: 7, mats: { bread: 3, tea: 1 }, out: { item: 'c_vodka' } },
  { id: 'r_razor', name: 'Лезвие за губу', minLevel: 8, mats: { blade: 2, thread: 1 }, out: { item: 'c_razor' } },
  { id: 'r_mouthpiece', name: 'Наборный мундштук', minLevel: 8, mats: { wood: 4, ink: 1, thread: 1 }, out: { gear: 'craft_mouthpiece' } },
  { id: 'r_letter', name: 'Малява с печатью', minLevel: 10, mats: { ink: 2, thread: 1, bread: 1 }, out: { item: 'c_letter' } },
  { id: 'r_ring', name: 'Перстень из проволоки', minLevel: 12, mats: { wire: 5, ink: 1, blade: 1 }, out: { gear: 'craft_ring' } },
  { id: 'r_icon', name: 'Иконка-оберег', minLevel: 14, mats: { wood: 3, ink: 2, cloth: 1 }, out: { item: 'c_icon' } },
  { id: 'r_amulet', name: 'Ладанка с родной землёй', minLevel: 16, mats: { cloth: 3, thread: 3, ink: 2, bread: 2 }, out: { gear: 'craft_amulet' } },
];
export const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

/** Где берутся материалы: «место.занятие» → что даёт. Смены и боссы — случайный материал. */
export const PLACE_MATS: Record<string, Partial<Record<MatId, number>>> = {
  'factory.sew': { thread: 2, cloth: 1 },
  'logging.stack': { wood: 3 },
  'kamera.road': { thread: 1, tea: 1 },
  'factory.wood': { wood: 2 },
  'factory.foundry': { wire: 2 },
  'factory.carry': { blade: 1, wire: 1 },
  'canteen.meal': { bread: 1 },
  'canteen.kitchen': { bread: 2, tea: 1 },
  'library.order': { ink: 1 },
  'visits.parcel': { tea: 2, cloth: 1 },
  'bath.wash': { cloth: 1 },
};

export const CRAFT = {
  /** шанс материала за смену и за победу над боссом */
  jobChance: 0.25,
  bossChance: 0.3,
  repPerCraft: 2,
};
