import { useEffect, useState } from 'react';
import { ModalHead } from './Nav.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, useNpc } from './art/sprites.tsx';
import { useGame } from './game.tsx';
import { babble } from './sound.ts';

const KEY = 'zona:chron';
const HEADS = ['{n}: день, который кум запомнит', 'Сенсация: {n} всё ещё жив', 'Эксклюзив: чем занимался {n}, пока все спали', '{n} снова в сводках. Мама в шоке', 'Срочно: {n} опять что-то натворил'];
const OUTROS = ['Следствие продолжается. Как и срок.', 'Редакция не несёт ответственности. Никто не несёт.', 'Подробности — у кума. Он уже в курсе.', 'Оставайтесь с нами. Выбора всё равно нет.'];
const today = () => new Date().toISOString().slice(0, 10);

/** «Криминальная хроника»: газетная полоса о твоих сутках. */
export function ChronicleModal({ onClose }: { onClose(): void }) {
  const { p, now } = useGame();
  const anchor = useNpc('sheet/cast/writer');
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  const items = p.journal.filter((j) => now - j.t < 24 * 3600_000).slice(0, 5);
  const head = HEADS[seed % HEADS.length].replace('{n}', p.name);
  const close = () => {
    try {
      localStorage.setItem(KEY, today());
    } catch {
      /* приватный режим */
    }
    onClose();
  };
  useEffect(() => {
    babble(head, 'Хроникёр');
  }, []);
  return (
    <div className="modal" onClick={close}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={close} title="🗞️ Криминальная хроника" />
        <div className="chron-paper">
          <div className="chron-mast">ВЕСТНИК ЗОНЫ · {new Date().toLocaleDateString('ru-RU')}</div>
          <h3>{head}</h3>
          <div className="chron-body">
            <svg viewBox="0 0 120 150" className="chron-pic">
              <rect width={120} height={150} fill="#d8d0c0" stroke="#1a1410" strokeWidth={3} />
              {anchor && (
                <Place x={60} y={170} scale={0.7}>
                  <ImageG url={anchor.url} height={anchor.height} anim="talk" hold="papers" />
                </Place>
              )}
            </svg>
            <ul>
              {items.map((j, i) => (
                <li key={i}>
                  <small>{new Date(j.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small> {j.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="chron-outro">{OUTROS[seed % OUTROS.length]}</p>
        </div>
        <button className="btn btn-wide" onClick={close}>
          Свернуть газету
        </button>
      </div>
    </div>
  );
}
