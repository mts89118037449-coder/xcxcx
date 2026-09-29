// Как выглядит каждая вещь на риге. Одежда описана не картинкой, а свойствами (цвет, фактура,
// длина рукава, воротник, подол) — поэтому садится на любую позу и двигается вместе с телом.

export type Pattern = 'none' | 'hstripes' | 'wstripes' | 'camo' | 'quilt' | 'denim' | 'burlap' | 'puffer' | 'fur' | 'check';

export interface TopWear {
  color: string;
  pattern?: Pattern;
  pattern2?: string; // второй цвет узора
  sleeves: 'none' | 'short' | 'long';
  sleeveColor?: string; // рукава другого цвета (футболка под жилеткой)
  neck: 'crew' | 'tank' | 'v' | 'collar' | 'hood' | 'fur' | 'zip';
  hem: number; // насколько ниже пояса (0 — по пояс, 30 — тулуп)
  bulk: number; // толщина: пуховик шире тела
  gloss?: boolean; // кожа блестит
  zip?: boolean;
  buttons?: boolean;
  pockets?: boolean;
  stripesSleeve?: string; // лампасы на рукавах (спортивка)
  epaulets?: boolean;
  belt?: string;
  apron?: string; // фартук поверх
  bib?: string; // лямки комбинезона поверх футболки
  lining?: string; // подкладка на воротнике/капюшоне
  legs?: LegWear; // вещь с брюками (форма, комбинезон, спортивка)
}

export interface LegWear {
  color: string;
  pattern?: Pattern;
  pattern2?: string;
  stripe?: string; // лампас
  pockets?: boolean;
}

export interface FeetWear {
  kind: 'slippers' | 'boots' | 'shoes';
  color: string;
  sole?: string;
}

export interface HeadWear {
  kind: 'beanie' | 'ushanka' | 'cap8' | 'capgold' | 'crown' | 'furazhka' | 'beret' | 'chef' | 'helmet' | 'baseball' | 'mink';
  color: string;
  color2?: string;
}

export const TOPS: Record<string, TopWear> = {
  body_tank: { color: '#e4e0d4', sleeves: 'none', neck: 'tank', hem: 0, bulk: 0 },
  body_telnyashka: { color: '#eceae4', pattern: 'hstripes', pattern2: '#2a3c62', sleeves: 'long', neck: 'crew', hem: 0, bulk: 0 },
  body_robe: { color: '#d6d4cc', pattern: 'wstripes', pattern2: '#232426', sleeves: 'long', neck: 'v', hem: 4, bulk: 1, buttons: true },
  body_quilted: { color: '#3a4048', pattern: 'quilt', sleeves: 'long', neck: 'collar', hem: 8, bulk: 3, buttons: true },
  body_smock: { color: '#9a8560', pattern: 'burlap', sleeves: 'short', neck: 'crew', hem: 6, bulk: 1 },
  body_gown: { color: '#a9c4c0', sleeves: 'short', neck: 'v', hem: 14, bulk: 1 },
  body_overalls: { color: '#34506e', sleeves: 'long', neck: 'collar', hem: 4, bulk: 2, zip: true, pockets: true, stripesSleeve: '#d8d06a' },
  body_apron: { color: '#5a5e62', sleeves: 'long', neck: 'hood', hem: 2, bulk: 2, apron: '#e8e2d2' },
  body_vest: { color: '#4d5a3a', pattern: 'quilt', sleeves: 'short', sleeveColor: '#2c2c2e', neck: 'zip', hem: 4, bulk: 3, zip: true },
  body_bomber: { color: '#2e3530', sleeves: 'long', neck: 'collar', hem: 2, bulk: 3, zip: true, lining: '#d0762a' },
  body_camo: { color: '#6e7050', pattern: 'camo', pattern2: '#4a4a32', sleeves: 'long', neck: 'hood', hem: 8, bulk: 3, pockets: true, legs: { color: '#6e7050', pattern: 'camo', pattern2: '#4a4a32', pockets: true } },
  body_denim: { color: '#46628a', pattern: 'denim', sleeves: 'long', neck: 'collar', hem: 2, bulk: 2, buttons: true, pockets: true },
  body_bib: { color: '#e8e4da', sleeves: 'short', neck: 'crew', hem: 0, bulk: 0, bib: '#3e5a86', legs: { color: '#3e5a86', pattern: 'denim' } },
  body_parka: { color: '#5a3e28', sleeves: 'long', neck: 'fur', hem: 18, bulk: 4, gloss: true, zip: true, lining: '#c8b89a' },
  body_alaska: { color: '#26344e', pattern: 'puffer', sleeves: 'long', neck: 'fur', hem: 10, bulk: 6, zip: true, lining: '#d86a2a' },
  body_leather: { color: '#1e1c1c', sleeves: 'long', neck: 'collar', hem: 2, bulk: 2, gloss: true, zip: true },
  body_tracksuit: { color: '#27459a', sleeves: 'long', neck: 'zip', hem: 0, bulk: 1, zip: true, stripesSleeve: '#f2f2f2', legs: { color: '#27459a', stripe: '#f2f2f2' } },
  drop_uniform: { color: '#5a6248', sleeves: 'long', neck: 'collar', hem: 4, bulk: 2, buttons: true, epaulets: true, belt: '#2a1e14', pockets: true, legs: { color: '#4e5640' } },
  drop_coat: { color: '#7a5634', pattern: 'fur', sleeves: 'long', neck: 'fur', hem: 34, bulk: 5, lining: '#e6dcc4', belt: '#3a2618' },
  body_hoodie: { color: '#5a5c60', sleeves: 'long', neck: 'hood', hem: 2, bulk: 2, pockets: true },
  body_flannel: { color: '#8a2a24', pattern: 'check', pattern2: '#1e1a1a', sleeves: 'long', neck: 'collar', hem: 2, bulk: 1, buttons: true, pockets: true },
  body_olympic: { color: '#8e1c22', sleeves: 'long', neck: 'zip', hem: 0, bulk: 1, zip: true, stripesSleeve: '#f2f2f2' },
  body_orange: { color: '#d8661e', sleeves: 'long', neck: 'crew', hem: 2, bulk: 1, buttons: true, pockets: true },
  body_sheepskin: { color: '#8a5a32', sleeves: 'long', neck: 'fur', hem: 22, bulk: 4, buttons: true, lining: '#eadcc0', pockets: true },
  body_crimson: { color: '#a0184a', sleeves: 'long', neck: 'collar', hem: 8, bulk: 2, buttons: true, lining: '#2a2a2e', pockets: true },
  body_kevlar: { color: '#4a5038', sleeves: 'long', sleeveColor: '#2a2c2e', neck: 'crew', hem: 2, bulk: 5, pockets: true, belt: '#1c1c14' },
  drop_greatcoat: { color: '#3a4636', sleeves: 'long', neck: 'collar', hem: 30, bulk: 5, buttons: true, epaulets: true, belt: '#8a6a2a', lining: '#c8a24a' },
  // только у НПС
  npc_whitecoat: { color: '#e6e6e0', sleeves: 'long', neck: 'collar', hem: 34, bulk: 2, buttons: true, pockets: true, legs: { color: '#3c4a56' } },
  npc_cassock: { color: '#18181a', sleeves: 'long', neck: 'crew', hem: 70, bulk: 3, buttons: true, legs: { color: '#18181a' } },
  npc_suit: { color: '#2a2c34', sleeves: 'long', neck: 'collar', hem: 8, bulk: 2, buttons: true, lining: '#e8e8e8', legs: { color: '#2a2c34' } },
  npc_guard: { color: '#3e4a5a', sleeves: 'long', neck: 'collar', hem: 6, bulk: 2, buttons: true, epaulets: true, belt: '#1c1410', pockets: true, legs: { color: '#343e4c' } },
  npc_black: { color: '#1e2226', sleeves: 'long', neck: 'collar', hem: 4, bulk: 3, pockets: true, belt: '#101010', legs: { color: '#1e2226', pockets: true } },
  npc_general: { color: '#2e3a4a', sleeves: 'long', neck: 'collar', hem: 10, bulk: 4, buttons: true, epaulets: true, belt: '#8a6a2a', lining: '#c8a24a', legs: { color: '#2a3442', stripe: '#b83a3a' } },
  npc_chef: { color: '#f0eee8', sleeves: 'long', neck: 'crew', hem: 6, bulk: 3, buttons: true, apron: '#e0dcd0', legs: { color: '#44464a' } },
};

export const LEGS: Record<string, LegWear> = {
  legs_pants: { color: '#3a3c40' },
  legs_cargo: { color: '#6a6c4a', pattern: 'camo', pattern2: '#454530', pockets: true },
  legs_jeans: { color: '#1e1e22', stripe: '#e8e8e8' },
  legs_varenki: { color: '#7090b6', pattern: 'denim', pockets: true },
  legs_wadded: { color: '#3a4048', pattern: 'quilt' },
  legs_black: { color: '#19191b', pockets: true },
};

export const FEET: Record<string, FeetWear> = {
  feet_slippers: { kind: 'slippers', color: '#6a4a34' },
  feet_kirza: { kind: 'boots', color: '#1c1a18', sole: '#0c0c0c' },
  feet_sneakers: { kind: 'shoes', color: '#3a2c22', sole: '#141210' },
  feet_valenki: { kind: 'boots', color: '#8a8480' },
  feet_lacquer: { kind: 'shoes', color: '#0e0e10', sole: '#3a2a1c' },
};

export const HATS: Record<string, HeadWear> = {
  cap_knit: { kind: 'beanie', color: '#26282c' },
  cap_ushanka: { kind: 'ushanka', color: '#6a6660', color2: '#3a3a3c' },
  cap_bandana: { kind: 'cap8', color: '#2a2a30' },
  cap_gold: { kind: 'capgold', color: '#1c1c1e', color2: '#d9a53a' },
  drop_crown: { kind: 'crown', color: '#d9a53a', color2: '#b83a3a' },
  cap_kevlar: { kind: 'helmet', color: '#3e4632' },
  drop_cap_general: { kind: 'furazhka', color: '#2e3a2a', color2: '#c8a24a' },
  drop_helmet: { kind: 'helmet', color: '#15171a' },
  cap_baseball: { kind: 'baseball', color: '#1e2a44', color2: '#e8e8e8' },
  cap_vdv: { kind: 'beret', color: '#3a6ab8' },
  cap_mink: { kind: 'mink', color: '#4a3424' },
  hat_police: { kind: 'furazhka', color: '#2e3a4a', color2: '#b83a3a' },
  hat_beret: { kind: 'beret', color: '#6a1e22' },
  hat_chef: { kind: 'chef', color: '#f2f0ea' },
  hat_helmet: { kind: 'helmet', color: '#2a2e2a' },
};

/** Кожа: основной тон, тень, свет. */
export const SKIN_TONES = [
  { base: '#d9a888', shade: '#a8745a', light: '#f0c8a8' },
  { base: '#e6c4ac', shade: '#b8927a', light: '#f6dccb' },
  { base: '#c68c62', shade: '#935d3e', light: '#e0aa82' },
  { base: '#8c5e40', shade: '#5e3c28', light: '#aa7858' },
];

export const HAIR_COLORS = ['#2a1e16', '#1a1614', '#4a3424', '#6a6258'];
