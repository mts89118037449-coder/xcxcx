import { INTERIORS } from '../shared/content.ts';
import { Price, useGame } from './game.tsx';

/** Отделка хаты: стены и пол. Купленное остаётся — можно переключать бесплатно. */
export function InteriorPicker() {
  const { p, act, busy, toast } = useGame();
  const row = (kind: 'wall' | 'floor', title: string) => (
    <>
      <h3 className="section">{title}</h3>
      <div className="hscroll">
        {INTERIORS.filter((i) => i.kind === kind).map((i) => {
          const owned = p.ownedInteriors.includes(i.id);
          const current = p.interior[kind] === i.id;
          return (
            <div key={i.id} className={`ftile ${current ? 'owned' : ''} ${i.currency === 'gold' && !owned ? 'premium' : ''}`}>
              <span className="interior-sample" style={{ background: i.color, borderColor: i.accent }} />
              <b>{i.name}</b>
              <button
                className={`btn btn-s ${i.currency === 'gold' && !owned ? 'btn-gold' : ''}`}
                disabled={busy || current}
                onClick={async () => {
                  if (!owned && i.currency === 'gold' && !confirm(`${i.name} за ${i.price} 🪙?`)) return;
                  if ((await act('interior', { id: i.id })) !== null) toast(`${i.name} — готово`);
                }}
              >
                {current ? '✓ Сейчас' : owned ? 'Поставить' : <Price amount={i.price} currency={i.currency} />}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
  return (
    <>
      {row('wall', 'Отделка стен')}
      {row('floor', 'Пол')}
    </>
  );
}
