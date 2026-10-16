import { useEffect, useState } from 'react';
import type { Look } from '../shared/types.ts';
import type { RigAnim } from './art/rig/Rig.tsx';
import { BUILDS, GOLD_PRICES, SKINS, faceOf, faceParts } from '../shared/content.ts';
import { Rig, RigHead } from './art/rig/Rig.tsx';
import { SKIN_TONES } from './art/rig/wear.ts';
import { Face } from './art/sprites.tsx';
import { Card, useGame } from './game.tsx';

type Section = 'face' | 'body' | 'name';

/** Редактор персонажа: лицо, телосложение, кожа, имя. */
export function CharacterEditor() {
  const { p, act, busy, toast } = useGame();
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
          <LivePreview look={{ equipped: p.equipped, tattoos: p.tattoos, str: p.str, face: p.face, skin: p.skin, build: p.build }} />
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
      </div>
      <LivePreview look={{ ...look, equipped: p.equipped, tattoos: p.tattoos }} />
      {row('hair', 'Причёска')}
      {row('beard', 'Борода')}
      {row('jaw', 'Лицо')}
      {row('brow', 'Брови')}
      <button
        className="btn btn-wide"
        data-tut="face"
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

/** Что показывает персонаж в предпросмотре — по кругу, или выбранное. */
const SHOW: { anim: RigAnim; icon: string; label: string }[] = [
  { anim: 'idle', icon: '🧍', label: 'Стоит' },
  { anim: 'wave', icon: '👋', label: 'Привет' },
  { anim: 'talk', icon: '🗣️', label: 'Базар' },
  { anim: 'flex', icon: '💪', label: 'Мышцы' },
  { anim: 'punch', icon: '👊', label: 'Удар' },
  { anim: 'kick', icon: '🦶', label: 'Пинок' },
  { anim: 'cheer', icon: '🙌', label: 'Радость' },
  { anim: 'dance', icon: '🕺', label: 'Пляс' },
  { anim: 'smoke', icon: '🚬', label: 'Курит' },
  { anim: 'sad', icon: '😔', label: 'Грусть' },
  { anim: 'proud', icon: '😎', label: 'Гордо' },
];

/** Живой предпросмотр: крупно, движения меняются сами — видно, как облик смотрится в деле. */
export function LivePreview({ look }: { look: Look }) {
  const [pick, setPick] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);
  useEffect(() => {
    if (pick !== null) return;
    const t = setInterval(() => setAuto((a) => (a + 1) % SHOW.length), 2400);
    return () => clearInterval(t);
  }, [pick]);
  const cur = pick ?? auto;
  return (
    <div className="live-preview">
      <svg viewBox="-20 -6 160 222" className="live-svg">
        <ellipse cx={60} cy={210} rx={46} ry={6} fill="#0004" />
        <Rig look={look} anim={SHOW[cur].anim} startKey={`${cur}${pick ?? ''}`} sfx={pick !== null} />
      </svg>
      <div className="live-chips">
        {SHOW.map((s, i) => (
          <button key={s.anim} className={cur === i ? 'active' : ''} onClick={() => setPick(pick === i ? null : i)} title={s.label}>
            {s.icon}
          </button>
        ))}
        <button className={pick === null ? 'active' : ''} onClick={() => setPick(null)} title="По кругу">
          🔁
        </button>
      </div>
    </div>
  );
}
