import { useState } from 'react';
import { BUILDS, GOLD_PRICES, SKINS, faceOf, faceParts } from '../shared/content.ts';
import { Rig, RigHead } from './art/rig/Rig.tsx';
import { SKIN_TONES } from './art/rig/wear.ts';
import { useArt } from './art/raster.ts';
import { Face, faceUrl } from './art/sprites.tsx';
import { Card, useGame } from './game.tsx';

type Section = 'face' | 'body' | 'name';

/** Редактор персонажа: лицо, телосложение, кожа, имя. */
export function CharacterEditor() {
  const { p, act, busy, toast } = useGame();
  const art = useArt();
  const [open, setOpen] = useState<Section | null>('face');
  const [name, setName] = useState(p.name);

  const tab = (s: Section, label: string) => (
    <button className={open === s ? 'active' : ''} onClick={() => setOpen(open === s ? null : s)}>
      {label}
    </button>
  );

  return (
    <Card className={p.faceChosen ? '' : 'glow'}>
      <div className="row">
        <div className="row gap-s">
          <Face face={p.face} size={52} />
          <div>
            <b>{p.name}</b>
            <div className="muted small">
              {BUILDS[p.build]?.name} · {SKINS[p.skin]?.name.toLowerCase()}
            </div>
          </div>
        </div>
      </div>
      <div className="seg" style={{ marginTop: 10, marginBottom: open ? 10 : 0 }}>
        {tab('face', 'Лицо')}
        {tab('body', 'Тело')}
        {tab('name', 'Имя')}
      </div>

      {open === 'face' && <FacePicker />}

      {open === 'body' && (
        <>
          <div className="muted small">Телосложение и кожа меняются бесплатно — смотри на персонажа в хате</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {BUILDS.map((b) => (
              <button key={b.id} className={p.build === b.id ? 'active' : ''} disabled={busy} onClick={() => act('look', { build: b.id, skin: p.skin })}>
                {b.name}
              </button>
            ))}
          </div>
          <div className="chips">
            {SKINS.map((s) => (
              <button key={s.id} className={p.skin === s.id ? 'active' : ''} disabled={busy} onClick={() => act('look', { build: p.build, skin: s.id })}>
                <span className="swatch" style={{ background: SKIN_TONES[s.id]?.base }} /> {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      {open === 'name' && (
        <form
          className="row gap-s"
          onSubmit={async (e) => {
            e.preventDefault();
            if (p.nameChanged && !confirm(`Сменить имя за ${GOLD_PRICES.rename} 🪙?`)) return;
            if ((await act('rename', { name })) !== null) toast('Теперь тебя зовут ' + name.trim());
          }}
        >
          <input className="input grow" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-s" disabled={busy || name.trim() === p.name}>
            {p.nameChanged ? `${GOLD_PRICES.rename} 🪙` : 'Бесплатно'}
          </button>
        </form>
      )}
    </Card>
  );
}

const PART_NAMES = {
  hair: ['Лысый', 'Ёжик', 'Короткая', 'Зачёс', 'Чёлка', 'Гребень', 'Длинные', 'Седой ёжик'],
  beard: ['Бритый', 'Щетина', 'Борода', 'Усы', 'Эспаньолка', 'Борода с усами'],
  jaw: ['Квадратное', 'Узкое', 'Тяжёлое'],
  brow: ['Спокойные', 'Хмурые'],
};

/** Лицо по частям: сразу видно на голове, применяется одной кнопкой. */
function FacePicker() {
  const { p, act, busy, toast } = useGame();
  const [parts, setParts] = useState(() => faceParts(p.face));
  const face = faceOf(parts);
  const look = { equipped: {}, tattoos: [], str: p.str, face, skin: p.skin, build: p.build };
  const row = (k: keyof typeof PART_NAMES, label: string) => (
    <div className="face-row">
      <span>{label}</span>
      <div className="chips">
        {PART_NAMES[k].map((n, i) => (
          <button key={n} className={parts[k] === i ? 'active' : ''} onClick={() => setParts({ ...parts, [k]: i })}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <div className="face-preview">
        <RigHead look={look} size={96} />
        <svg viewBox="0 0 120 214" width={70} height={125}>
          <Rig look={{ ...look, equipped: p.equipped, tattoos: p.tattoos }} anim="idle" />
        </svg>
      </div>
      {row('hair', 'Причёска')}
      {row('beard', 'Борода')}
      {row('jaw', 'Лицо')}
      {row('brow', 'Брови')}
      <button
        className="btn btn-wide"
        disabled={busy || (face === p.face && p.faceChosen)}
        onClick={async () => {
          if (p.faceChosen && !confirm(`Сменить внешность за ${GOLD_PRICES.faceChange} 🪙?`)) return;
          if ((await act('face', { face })) !== null) toast('Новая внешность');
        }}
      >
        {p.faceChosen ? `Применить · ${GOLD_PRICES.faceChange} 🪙` : 'Применить (первый раз бесплатно)'}
      </button>
    </>
  );
}
