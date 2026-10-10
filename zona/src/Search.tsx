import { useMemo, useState } from 'react';
import type { Place, Tab } from './game.tsx';
import { useGame } from './game.tsx';
import { jumpSeg } from './Seg.tsx';
import { ModalHead } from './Nav.tsx';

interface Spot {
  e: string;
  n: string;
  /** где: для подсказки под названием */
  w: string;
  k?: string;
  tab: Tab;
  seg?: [string, string];
  place?: Place;
  /** нажать кнопку с этим текстом после перехода */
  click?: string;
  /** подсветить кнопку с этим текстом */
  find?: string;
}

const SPOTS: Spot[] = [
  { e: '📖', n: 'Сюжет', w: 'Хата', k: 'глава история задание', tab: 'home', seg: ['home', 'story'] },
  { e: '✏️', n: 'Облик', w: 'Хата', k: 'лицо внешность причёска борода', tab: 'home', seg: ['home', 'look'] },
  { e: '🛠️', n: 'Обустроить хату', w: 'Хата', k: 'мебель уют интерьер', tab: 'home', seg: ['home', 'cell'] },
  { e: '🚶', n: 'Двор', w: 'Зона → Куда пойти', k: 'прогулка', tab: 'fight', seg: ['fight', 'bosses'] },
  { e: '🏚️', n: 'По хатам', w: 'Зона', k: 'гости соседи пошарить', tab: 'zone', find: 'По хатам' },
  { e: '💪', n: 'Турник', w: 'Зона', k: 'подтягивания', tab: 'zone', place: 'pullups' },
  { e: '⛪', n: 'Церковь', w: 'Зона', k: 'батюшка благословение', tab: 'zone', place: 'church' },
  { e: '🏥', n: 'Санчасть', w: 'Зона', k: 'лечение врач лепила', tab: 'zone', place: 'medic' },
  { e: '🧼', n: 'Баня', w: 'Зона', tab: 'zone', place: 'bath' },
  { e: '🍲', n: 'Столовая', w: 'Зона', k: 'еда баланда', tab: 'zone', place: 'canteen' },
  { e: '📚', n: 'Библиотека', w: 'Зона', k: 'книги', tab: 'zone', place: 'library' },
  { e: '🎸', n: 'Клуб', w: 'Зона', tab: 'zone', place: 'club' },
  { e: '💌', n: 'Свиданка (место)', w: 'Зона', k: 'таксофон передача', tab: 'zone', place: 'visits' },
  { e: '🧱', n: 'ШИЗО', w: 'Зона', k: 'карцер изолятор', tab: 'zone', place: 'shizo' },
  { e: '🕳️', n: 'Побег', w: 'Зона', k: 'бежать сбежать', tab: 'zone', place: 'escape' },
  { e: '🛒', n: 'Рынок', w: 'Зона → Рынок', k: 'продать купить лот', tab: 'zone', seg: ['zone', 'market'] },
  { e: '📦', n: 'Контрабанда', w: 'Зона → Рынок', k: 'чай сигареты мобила кабур шмон', tab: 'zone', seg: ['zone', 'market'] },
  { e: '🤝', n: 'Общак и долги', w: 'Зона → Люди', k: 'занять барыга общак', tab: 'zone', seg: ['zone', 'people'] },
  { e: '📅', n: 'Событие недели', w: 'Зона → Неделя', tab: 'zone', seg: ['zone', 'week'] },
  { e: '📰', n: 'Стенгазета', w: 'Зона', k: 'газета хроника новости', tab: 'zone', find: 'Газета' },
  { e: '👑', n: 'Смотрящий и выборы', w: 'Зона', k: 'голосовать налог указ', tab: 'zone', find: 'Смотрящий' },
  { e: '🏗️', n: 'Стройка зоны', w: 'Зона', k: 'вложить построить', tab: 'zone', find: 'Стройка' },
  { e: '🎄', n: 'Праздник', w: 'Зона', k: 'новый год пасха 23 февраля', tab: 'zone', find: 'Новый год' },
  { e: '⚒️', n: 'Смены', w: 'Дела', k: 'работа промка деньги', tab: 'work', seg: ['work', 'jobs'] },
  { e: '🎲', n: 'Игры', w: 'Дела → Игры', k: 'кости очко нарды домино мини-игры', tab: 'work', seg: ['work', 'games'] },
  { e: '🎬', n: 'Викторина', w: 'Дела → Игры', k: 'вечер в клубе вопросы', tab: 'work', seg: ['work', 'games'], find: 'Вечер в клубе' },
  { e: '🔤', n: 'Слово дня', w: 'Дела → Игры', k: 'феня вордли', tab: 'work', seg: ['work', 'games'], find: 'Слово дня' },
  { e: '⚽', n: 'Футбол', w: 'Дела → Игры', k: 'пенальти кубок', tab: 'work', seg: ['work', 'games'], find: 'Футбол' },
  { e: '🎲', n: 'Турнир в нарды', w: 'Дела → Игры', tab: 'work', seg: ['work', 'games'], find: 'Турнир' },
  { e: '📋', n: 'Поручения', w: 'Дела', k: 'квесты', tab: 'work', seg: ['work', 'quests'] },
  { e: '✅', n: 'Дела дня', w: 'Дела', k: 'ежедневные задания', tab: 'work', seg: ['work', 'daily'] },
  { e: '💪', n: 'Качалка', w: 'Дела', k: 'сила ловкость выносливость навыки очки', tab: 'work', seg: ['work', 'gym'] },
  { e: '👹', n: 'Боссы', w: 'Бой', tab: 'fight', seg: ['fight', 'bosses'] },
  { e: '🥊', n: 'Наезд', w: 'Бой', k: 'pvp лига месть', tab: 'fight', seg: ['fight', 'pvp'] },
  { e: '🔥', n: 'Бунт', w: 'Бой / Зона', k: 'омон', tab: 'fight', seg: ['fight', 'riot'] },
  { e: '🏟️', n: 'Ринг', w: 'Бой', k: 'ставки живой бой', tab: 'fight', seg: ['fight', 'ring'] },
  { e: '🏴', n: 'Кланы', w: 'Бой → Братва', k: 'клан бараки стукач', tab: 'top', click: 'Кланы' },
  { e: '🏚️', n: 'Бараки', w: 'Бой → Братва → Кланы', k: 'территории набег', tab: 'top', click: 'Кланы' },
  { e: '🐀', n: 'Кто стукач?', w: 'Бой → Братва → Кланы', tab: 'top', click: 'Кланы' },
  { e: '💬', n: 'Чат', w: 'Бой → Братва', tab: 'top', click: 'Чат' },
  { e: '🏆', n: 'Рейтинг и кенты', w: 'Бой → Братва', k: 'реферал пригласить друзей', tab: 'top', click: 'Рейтинг' },
  { e: '👤', n: 'Профиль', w: 'Я', k: 'статы срок удо', tab: 'gear', seg: ['me', 'me'] },
  { e: '🎒', n: 'Шмот', w: 'Я → Шмот', k: 'одежда вещи купить надеть', tab: 'gear', seg: ['me', 'gear'], click: 'Надето' },
  { e: '🖋️', n: 'Наколки', w: 'Я → Шмот', k: 'татуировки', tab: 'gear', seg: ['me', 'gear'], click: 'Наколки' },
  { e: '🃏', n: 'Перки', w: 'Я → Шмот', tab: 'gear', seg: ['me', 'gear'], click: 'Перки' },
  { e: '🔧', n: 'Ремесло', w: 'Я → Шмот', k: 'крафт материалы', tab: 'gear', seg: ['me', 'gear'], click: 'Ремесло' },
  { e: '📒', n: 'Альбом', w: 'Я', k: 'трофеи коллекция', tab: 'gear', seg: ['me', 'me'], find: 'Альбом' },
  { e: '📨', n: 'Малявы', w: 'Я', k: 'почта записки письма', tab: 'gear', seg: ['me', 'me'], find: 'Малявы' },
  { e: '👵', n: 'Свиданка с роднёй', w: 'Я', k: 'мама жена', tab: 'gear', seg: ['me', 'me'], find: 'Свиданка' },
  { e: '💌', n: 'Заочница', w: 'Я', k: 'письма девушка свадьба', tab: 'gear', seg: ['me', 'me'], find: 'Заочница' },
  { e: '🖋️', n: 'Кольщик', w: 'Я', k: 'мастер набить наколку', tab: 'gear', seg: ['me', 'me'], find: 'Кольщик' },
  { e: '⛏️', n: 'Подкоп', w: 'Я', k: 'тоннель лаз', tab: 'gear', seg: ['me', 'me'], find: 'Подкоп' },
  { e: '⚖️', n: 'Апелляция', w: 'Я', k: 'суд срок', tab: 'gear', seg: ['me', 'me'], find: 'Апелляция' },
  { e: '🐈', n: 'Питомец', w: 'Я', k: 'кот крыса голубь', tab: 'gear', seg: ['me', 'me'], find: 'живность' },
  { e: '🔊', n: 'Звук и настройки', w: 'Я', k: 'музыка уведомления', tab: 'gear', seg: ['me', 'me'], find: 'Звук' },
  { e: '⭐', n: 'Ларёк', w: 'кнопка ⭐ вверху', k: 'золото купить донат вип', tab: 'shop' },
];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Найти кнопку с текстом на экране: экраны грузятся не сразу — пробуем пару секунд. */
function locate(text: string, act: (el: HTMLElement) => void) {
  const t0 = Date.now();
  const tick = () => {
    const els = [...document.querySelectorAll<HTMLElement>('main button, main .now-chip, main [role=button]')];
    const t = norm(text);
    // сначала точное совпадение; «содержит» — только если точного так и не появилось
    const late = Date.now() - t0 > 1200;
    const el = els.find((x) => norm(x.textContent ?? '').trim() === t) ?? (late ? els.find((x) => norm(x.textContent ?? '').includes(t)) : undefined);
    if (el) return act(el);
    if (Date.now() - t0 < 2500) setTimeout(tick, 150);
  };
  setTimeout(tick, 150);
}

export function flash(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash-find');
  void el.offsetWidth;
  el.classList.add('flash-find');
  setTimeout(() => el.classList.remove('flash-find'), 2400);
}

/** Поиск «Что где»: набрал слово — попал на место. */
export function SearchModal({ onClose }: { onClose(): void }) {
  const { go, openPlace } = useGame();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return SPOTS;
    return SPOTS.filter((x) => norm(`${x.n} ${x.k ?? ''} ${x.w}`).includes(s));
  }, [q]);
  const open = (x: Spot) => {
    onClose();
    go(x.tab);
    if (x.seg) jumpSeg(x.seg[0], x.seg[1]);
    if (x.place) setTimeout(() => openPlace(x.place!), 50);
    if (x.click) locate(x.click, (el) => (el.click(), x.find || flash(el)));
    if (x.find) locate(x.find, flash);
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body search-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="Что где" />
        <input className="input search-input" autoFocus placeholder="наколка, подкоп, футбол, кланы…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="search-list">
          {list.map((x) => (
            <button key={x.n} className="search-row" onClick={() => open(x)}>
              <span>{x.e}</span>
              <b>{x.n}</b>
              <small>{x.w}</small>
            </button>
          ))}
          {list.length === 0 && <div className="muted center">Ничего не нашлось — попробуй другое слово</div>}
        </div>
      </div>
    </div>
  );
}
