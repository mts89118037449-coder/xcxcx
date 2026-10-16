// Дисциплинарка: любой экран может вызвать «суд над игроком», а показывает его App поверх всего.
type Case = { days: number; reason: string } | null;
let cur: Case = null;
const subs = new Set<() => void>();

export function showDiscipline(days: number, reason: string) {
  cur = { days, reason };
  subs.forEach((f) => f());
}
export function closeDiscipline() {
  cur = null;
  subs.forEach((f) => f());
}
export const disciplineCase = () => cur;
export function onDiscipline(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
