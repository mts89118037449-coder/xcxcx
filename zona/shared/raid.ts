// «Шмон с неба»: ОМОН спускается на парашютах, а ты бегаешь по двору с коробкой запрещёнки.
// Чем дольше продержался — тем больше бычков. Продержался до конца — премия.
export const RAID = { perDay: 5, seconds: 20, perSec: 0.5, fullBonus: 4 };

export const raidButts = (sec: number) => {
  const s = Math.max(0, Math.min(RAID.seconds, sec));
  return Math.floor(s * RAID.perSec) + (s >= RAID.seconds ? RAID.fullBonus : 0);
};
