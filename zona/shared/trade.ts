// Обмен вещами между игроками: «я тебе бинт, ты мне три нитки». Деньги и золото не меняются —
// чтобы не перекачивали на запасные аккаунты. Отданное лежит «в залоге», пока второй не ответит.

export const TRADE = {
  minLevel: 5,
  perDay: 5,
  maxOpen: 3,
  /** строк в каждой стороне */
  maxLines: 3,
  maxQty: 10,
  ttlH: 24,
};

export type TradeKind = 'item' | 'mat' | 'gear';
export interface TradeLine {
  kind: TradeKind;
  ref: string;
  qty: number;
}
