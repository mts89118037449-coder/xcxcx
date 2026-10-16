// Малявы: записки между игроками. Текст — из готовых фраз (никакой модерации не нужно),
// к записке можно приложить бычки. Вертухай иногда перехватывает: кум читает вслух на всю зону,
// бычки пропадают, а отправителю — неприятности. Через шныря за рыжьё — доходит наверняка.

export interface MalyavaText {
  id: string;
  text: string;
  /** опасная записка: перехватывают чаще, наказывают строже */
  risky?: boolean;
}

export const MALYAVY: MalyavaText[] = [
  { id: 'hi', text: 'Привет из хаты! Держись, братуха.' },
  { id: 'thanks', text: 'Спасибо за грев, не забуду.' },
  { id: 'nardy', text: 'Вечером нарды? Жду в клубе.' },
  { id: 'smoke', text: 'Подходи в курилку, есть разговор.' },
  { id: 'tea', text: 'Загони чаю, отдам с передачи.' },
  { id: 'debt', text: 'Должок за тобой. Не тяни.' },
  { id: 'respect', text: 'Уважаю. Если что — обращайся.' },
  { id: 'warn', text: 'Осторожно: кум под тебя копает.', risky: true },
  { id: 'stash', text: 'Нычка на старом месте, под третьей половицей.', risky: true },
  { id: 'escape', text: 'Готовлю рывок. Ты в деле?', risky: true },
];
/** Голубиная почта: посылка без слов, только бычки и запах голубя. */
export const PIGEON_MSG: MalyavaText = { id: 'pigeon', text: '🕊️ Голубь принёс посылку. Пахнет свободой и немного голубем.' };
export const PIGEON = { perDay: 1, perDayWithPet: 3, butts: [5, 10, 20], shotPct: 15 };
export const malyavaById = new Map([...MALYAVY, PIGEON_MSG].map((m) => [m.id, m]));

export const MALYAVA = {
  minLevel: 3,
  perDay: 10,
  /** шанс перехвата, % */
  intercept: 15,
  interceptRisky: 35,
  /** сколько бычков можно приложить */
  butts: [0, 10, 50],
  /** через шныря — без перехвата */
  safeGold: 3,
  /** наказание за перехват: +дней срока */
  termPenalty: 0.5,
  termPenaltyRisky: 2,
  inbox: 20,
};
