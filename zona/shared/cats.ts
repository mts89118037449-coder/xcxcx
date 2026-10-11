// Кошачья банда: пять котов по всей зоне. Прикорми каждого (по паре бычков на рыбью голову) —
// и банда признает тебя своим: золото и звание.
export const CATS: { id: string; name: string; where: string }[] = [
  { id: 'fence', name: 'Чёрный Пахан', where: 'на заборе во дворе' },
  { id: 'white', name: 'Белый Шнырь', where: 'во дворе' },
  { id: 'ginger', name: 'Рыжий Барыга', where: 'во дворе' },
  { id: 'map', name: 'Серый Кум', where: 'у ларька на зоне' },
  { id: 'canteen', name: 'Толстый Повар', where: 'в столовой' },
];
export const CAT_FEED = { butts: 2, rewardGold: 5 };
