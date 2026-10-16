import { FURNITURE } from '../shared/content.ts';

/** Хата с примеркой: вещь на своём месте вместо того, что там стоит. */
export function withPreview(cell: string[], preview: string | null): string[] {
  const f = preview ? FURNITURE.find((x) => x.id === preview) : null;
  if (!f) return cell;
  return [...cell.filter((id) => FURNITURE.find((x) => x.id === id)?.spot !== f.spot), f.id];
}
