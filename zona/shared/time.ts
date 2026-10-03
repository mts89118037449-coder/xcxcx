// Время по Москве — отдельно и без зависимостей, чтобы клиент не тянул за собой тяжёлые модули.

/** Ночь на зоне: с 22 до 6 по Москве. */
export const isNight = (now: number) => {
  const h = (new Date(now).getUTCHours() + 3) % 24;
  return h >= 22 || h < 6;
};
