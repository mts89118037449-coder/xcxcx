import { DogShowModal, DogTricks } from './DogShow.tsx';
import { ModalHead } from './Nav.tsx';
import { useState } from 'react';
import { PET, PETS, petByKind, CAT_WEAR } from '../shared/pets.ts';
import { fmt, timeLeft, useGame } from './game.tsx';

const H = 3600_000;

/** Питомец в профиле: завести, кормить, дрессировать. */
export function PetCard() {
  const { p, now, act, busy, toast } = useGame();
  const [pick, setPick] = useState(false);
  const [show, setShow] = useState(false);
  const pet = p.pet;
  if (!pet) {
    return (
      <>
        <button className="pet-card" onClick={() => setPick(true)}>
          <span className="pet-ico">🐾</span>
          <span className="grow">
            <b>Завести живность</b>
            <small>{PETS.map((d) => d.emoji).join(' ')} лечит, тащит находки, носит посылки</small>
          </span>
          <i>▸</i>
        </button>
        {pick && <PetShop onClose={() => setPick(false)} />}
      </>
    );
  }
  const def = petByKind.get(pet.kind)!;
  const hungry = now - pet.fedAt > PET.hungryH * H;
  const feedIn = pet.fedAt + PET.feedH * H - now;
  const trainIn = pet.trainAt + PET.trainH * H - now;
  const need = PET.xpTo(pet.level);
  const max = pet.level >= PET.maxLevel;
  const mood = hungry ? '😿 голодный — сила вдвое меньше' : feedIn > 0 ? '😺 сытый' : '🍽️ ждёт корма';
  return (
    <div className={`pet-card on ${hungry ? 'hungry' : ''}`}>
      <span className="pet-ico big">{def.emoji}</span>
      <span className="grow">
        <b>
          {pet.name} <small>{pet.name !== def.name && `· ${def.name.toLowerCase()} `}· ур. {pet.level}</small>
        </b>
        <div className="pet-bar">
          <i style={{ width: `${max ? 100 : Math.min(100, (pet.xp / need) * 100)}%` }} />
        </div>
        <small>{def.perk(hungry ? Math.floor(pet.level / 2) : pet.level)}</small>
        <small>{mood}</small>
        <span className="row gap-s">
          <button
            className="btn btn-dark"
            disabled={busy || feedIn > 0 || p.butts < PET.feedButts}
            onClick={async () => {
              const r = await act<{ up: boolean; heal: number }>('petFeed');
              if (r) toast(`${def.emoji} Наелся${r.heal ? ` · ❤️+${r.heal}` : ''}${r.up ? ' · подрос!' : ''}`);
            }}
          >
            {feedIn > 0 ? `🍖 ${timeLeft(feedIn)}` : `🍖 Покормить · ${PET.feedButts} 🚬`}
          </button>
          <button
            className="btn btn-dark"
            disabled={busy || trainIn > 0 || max || p.energy < PET.trainEnergy}
            onClick={async () => {
              const r = await act<{ up: boolean }>('petTrain');
              if (r) toast(`${def.emoji} Дрессировка${r.up ? ' · подрос!' : ' · +опыт'}`);
            }}
          >
            {max ? '🏅 Макс.' : trainIn > 0 ? `🎾 ${timeLeft(trainIn)}` : `🎾 Учить · ${PET.trainEnergy} ⚡`}
          </button>
        </span>
        {pet.kind === 'dog' && (
          <>
            <DogTricks level={pet.level} />
            <button className="btn btn-s btn-gold" onClick={() => setShow(true)} style={{ marginTop: 6 }}>
              🏆 Выставка собак
            </button>
            {show && <DogShowModal onClose={() => setShow(false)} />}
          </>
        )}
        {pet.kind === 'cat' && (
          <span className="pet-wear">
            {CAT_WEAR.map((w) => {
              const own = pet.wear?.includes(w.id);
              return (
                <button key={w.id} className={pet.on === w.id ? 'active' : ''} disabled={busy || (!own && pet.level < w.minLevel)} title={w.name} onClick={() => act('petWear', { id: w.id })}>
                  {w.emoji}
                  <small>{own ? (pet.on === w.id ? 'надето' : 'надеть') : w.gold ? `${w.gold}🪙` : `${w.butts}🚬`}</small>
                </button>
              );
            })}
          </span>
        )}
      </span>
    </div>
  );
}

function PetShop({ onClose }: { onClose(): void }) {
  const { p, act, busy, toast } = useGame();
  const [name, setName] = useState('');
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <h3 className="center">🐾 Живность в хату</h3>
        <input className="input" placeholder="Кличка (необязательно)" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="pet-shop">
          {PETS.map((d) => {
            const lock = p.level < d.minLevel;
            return (
              <button
                key={d.kind}
                className="pet-offer"
                disabled={busy || lock || p.money < d.price}
                onClick={async () => {
                  const r = await act('petBuy', { kind: d.kind, name });
                  if (r) {
                    toast(`${d.emoji} Теперь в хате ${d.name.toLowerCase()}`);
                    onClose();
                  }
                }}
              >
                <span className="pet-ico big">{d.emoji}</span>
                <b>{d.name}</b>
                <small>{d.perk(1)}</small>
                <i>{lock ? `🔒 с ${d.minLevel} ур.` : `${fmt(d.price)} ₽`}</i>
              </button>
            );
          })}
        </div>
        <button className="btn btn-wide" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
