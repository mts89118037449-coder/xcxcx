import { CHURCH } from '../shared/content.ts';
import { ChurchScene, Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { lookOf, timeLeft, useGame } from './game.tsx';

/** Тюремная церквушка: всё бесплатно или за бычки — занятие, когда нет энергии. */
export function Church({ onBack }: { onBack(): void }) {
  const { p, now, act, toast, say } = useGame();
  const priest = useNpc('sheet/cast/priest');
  const blessed = p.blessUntil > now;

  const talk = () =>
    say({
      who: 'sheet/cast/priest',
      name: 'Отец Никодим',
      text: blessed
        ? `Благодать на тебе ещё ${timeLeft(p.blessUntil - now)}. Иди с миром, сын мой.`
        : 'Мир тебе, сын мой. Здесь все равны — и блатной, и мужик. Чем помочь?',
      options: [
        {
          label: now >= p.prayReadyAt ? 'Помолиться (бесплатно)' : `Помолиться — через ${timeLeft(p.prayReadyAt - now)}`,
          disabled: now < p.prayReadyAt,
          onPick: async () => {
            if ((await act('pray')) !== null) toast(`Благословение: +${CHURCH.blessMoney}% денег, +${CHURCH.blessCrit}% крита`);
          },
        },
        {
          label: `Поставить свечку (${CHURCH.candleCost} 🚬, благодать на ${CHURCH.candleBlessMin / 60} ч)`,
          disabled: p.butts < CHURCH.candleCost,
          onPick: async () => {
            if ((await act('candle')) !== null) toast('Свечка горит');
          },
        },
        {
          label: p.confessReady ? 'Исповедаться (лечит 30%)' : 'Исповедь — завтра',
          disabled: !p.confessReady,
          onPick: async () => {
            if ((await act('confess')) !== null) toast('На душе полегчало');
          },
        },
        { label: 'Уйти' },
      ],
    });

  return (
    <>
      <div className="scene-wrap">
        <ChurchScene candles={blessed ? 9 : 3}>
          <Place x={120} y={264} scale={0.92}>
            <PoseG name="stand" look={lookOf(p)} />
          </Place>
          {priest && (
            <g className="npc-click" onClick={talk}>
              <Place x={262} y={262} scale={0.9}>
                <ImageG url={priest.url} height={priest.height} className="char-breathe" />
              </Place>
              <g className="talk-bubble" transform={`translate(262 ${262 - priest.height * 0.9 - 8})`}>
                <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill="#f2e6c8" />
                <path d="M-3,5 L0,10 L3,5 Z" fill="#f2e6c8" />
                <text x={0} y={2} fontSize={9} textAnchor="middle">🙏</text>
              </g>
            </g>
          )}
        </ChurchScene>
        <div className="scene-tag">⛪ Церковь</div>
        <button className="place-back" onClick={onBack}>
          ← На зону
        </button>
      </div>
      <div className="muted small center">
        {blessed ? <span className="bless">✨ Благодать ещё {timeLeft(p.blessUntil - now)}</span> : 'Нажми на батюшку — помолиться можно бесплатно'}
      </div>
    </>
  );
}
