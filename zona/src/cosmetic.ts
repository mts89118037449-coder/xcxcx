import { cosmeticById } from '../shared/season.ts';

/** Рамка аватара: css-класс по надетой косметике. */
export const frameClass = (frame: string | null | undefined) => (frame ? `frame-${cosmeticById.get(frame)?.value ?? ''}` : '');
export const titleOf = (title: string | null | undefined) => (title ? cosmeticById.get(title)?.value : undefined);
