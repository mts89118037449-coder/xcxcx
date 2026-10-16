import { consumableById } from '../shared/perks.ts';

export function itemLabel(id: string): string {
  const c = consumableById.get(id);
  return c ? `${c.emoji} ${c.name}` : id;
}
