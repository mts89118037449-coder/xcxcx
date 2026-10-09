// Слово дня по фене: угадать за 6 попыток, как в «Вордли». Длина — от 4 до 7 букв.

export interface FenyaWord {
  word: string;
  meaning: string;
}

export const FENYA: FenyaWord[] = [
  { word: 'ШМОН', meaning: 'обыск в камере или на зоне' },
  { word: 'ШКОНКА', meaning: 'кровать, нары' },
  { word: 'ЧИФИР', meaning: 'очень крепкий чай' },
  { word: 'МАЛЯВА', meaning: 'записка, письмо' },
  { word: 'ГРЕВ', meaning: 'передача, помощь продуктами и вещами' },
  { word: 'ХАТА', meaning: 'камера' },
  { word: 'ПАХАН', meaning: 'главный, старший' },
  { word: 'БАРЫГА', meaning: 'торговец, перекупщик' },
  { word: 'ДОРОГА', meaning: 'верёвочная почта между камерами' },
  { word: 'ШНЫРЬ', meaning: 'уборщик, прислужник' },
  { word: 'ЛЕПИЛА', meaning: 'врач' },
  { word: 'КОЛЬЩИК', meaning: 'тот, кто бьёт наколки' },
  { word: 'ЭТАП', meaning: 'перевозка заключённых' },
  { word: 'ОБЩАК', meaning: 'общая касса' },
  { word: 'ФРАЕР', meaning: 'чужой воровскому миру' },
  { word: 'БАКЛАН', meaning: 'хулиган, задира' },
  { word: 'КРЫСА', meaning: 'тот, кто ворует у своих' },
  { word: 'ПОНЯТИЯ', meaning: 'неписаные законы' },
  { word: 'КИЧА', meaning: 'тюрьма' },
  { word: 'НАРЫ', meaning: 'лежанка в камере' },
  { word: 'ПЕРО', meaning: 'нож' },
  { word: 'ЗАТОЧКА', meaning: 'самодельный нож' },
  { word: 'БАЗАР', meaning: 'разговор' },
  { word: 'БАБКИ', meaning: 'деньги' },
  { word: 'ХАВКА', meaning: 'еда' },
  { word: 'КОНВОЙ', meaning: 'охрана при перевозке' },
  { word: 'КУПОЛА', meaning: 'наколка: сколько куполов — столько ходок' },
  { word: 'ХОДКА', meaning: 'срок отсидки' },
  { word: 'ВОЛЯ', meaning: 'свобода' },
  { word: 'ФЕНЯ', meaning: 'воровской жаргон' },
  { word: 'КЕНТ', meaning: 'друг, приятель' },
  { word: 'КОРЕШ', meaning: 'друг' },
  { word: 'КОСЯК', meaning: 'проступок, ошибка' },
  { word: 'ПРОМКА', meaning: 'промзона, рабочая часть колонии' },
  { word: 'ТЕЛЕГА', meaning: 'жалоба, донос' },
  { word: 'КЛИФТ', meaning: 'пиджак' },
  { word: 'ДУБАК', meaning: 'надзиратель; ещё — холод' },
  { word: 'КАНДЕЙ', meaning: 'карцер' },
  { word: 'МАСТЬ', meaning: 'положение в тюремной иерархии' },
  { word: 'ПАЙКА', meaning: 'норма хлеба' },
  { word: 'ШКОНАРЬ', meaning: 'то же, что шконка — кровать' },
  { word: 'ВЕРТУХ', meaning: 'надзиратель (вертухай)' },
  { word: 'КОНЬ', meaning: 'верёвка для передачи между камерами' },
  { word: 'ШИРМА', meaning: 'прикрытие при краже' },
  { word: 'ФИКСА', meaning: 'золотая коронка на зубе' },
  { word: 'ОТМАЗКА', meaning: 'оправдание' },
  { word: 'БАЛАНДА', meaning: 'тюремная похлёбка' },
  { word: 'ШУХЕР', meaning: 'тревога, опасность' },
  { word: 'ЗАСАДА', meaning: 'неприятность' },
  { word: 'КИПИШ', meaning: 'шум, переполох' },
  { word: 'СТУКАЧ', meaning: 'доносчик' },
  { word: 'СХОДКА', meaning: 'собрание авторитетов' },
  { word: 'МУЖИК', meaning: 'простой работающий заключённый' },
  { word: 'ГОНЕВО', meaning: 'враньё, тоска' },
  { word: 'ШАРИТЬ', meaning: 'понимать, разбираться' },
  { word: 'КАТАЛА', meaning: 'карточный шулер' },
  { word: 'ЖУЛИК', meaning: 'вор, плут' },
  { word: 'ЛОПАТНИК', meaning: 'бумажник' },
].filter((w) => w.word.length >= 4 && w.word.length <= 7);

export const WORD = { tries: 6, streakGold: [[3, 3], [7, 10], [30, 40]] as [number, number][] };

/** Слово на день: порядок перемешан, но для всех одинаковый. */
export function wordOfDay(dayIndex: number): FenyaWord {
  const n = FENYA.length;
  // перестановка с шагом, взаимно простым с длиной списка
  let step = 7;
  while (gcd(step, n) !== 1) step++;
  return FENYA[(((dayIndex * step) % n) + n) % n];
}
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export const normWord = (s: string) => s.toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');

/** Подсветка попытки: g — на месте, y — есть в слове, x — нет. Повторы считаются честно. */
export function markGuess(guess: string, answer: string): ('g' | 'y' | 'x')[] {
  const g = [...normWord(guess)];
  const a = [...normWord(answer)];
  const out: ('g' | 'y' | 'x')[] = g.map(() => 'x');
  const left: Record<string, number> = {};
  a.forEach((ch, i) => {
    if (g[i] === ch) out[i] = 'g';
    else left[ch] = (left[ch] ?? 0) + 1;
  });
  g.forEach((ch, i) => {
    if (out[i] === 'g') return;
    if (left[ch]) {
      out[i] = 'y';
      left[ch]--;
    }
  });
  return out;
}
