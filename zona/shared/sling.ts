// «Перекинь маляву»: рогаткой через забор в окно соседнего барака. Ветер, вертухай на стене.
// Три выстрела, за каждое попадание — бычки.
export const SLING = { perDay: 4, shots: 3, buttsPerHit: 4, allBonus: 4 };
export const slingButts = (hits: number) => {
  const h = Math.max(0, Math.min(SLING.shots, Math.floor(hits)));
  return h * SLING.buttsPerHit + (h === SLING.shots ? SLING.allBonus : 0);
};
