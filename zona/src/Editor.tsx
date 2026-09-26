import { useState } from 'react';
import { BUILDS, FACE_COUNT, GOLD_PRICES, SKINS } from '../shared/content.ts';
import { useArt } from './art/raster.ts';
import { Face, faceUrl } from './art/sprites.tsx';
import { Card, useGame } from './game.tsx';

type Section = 'face' | 'body' | 'name';

/** Редактор персонажа: лицо, телосложение, кожа, имя. */
export function CharacterEditor() {
  const { p, act, busy, toast } = useGame();
  const art = useArt();
  const [open, setOpen] = useState<Section | null>(p.faceChosen ? null : 'face');
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

      {open === 'face' && faceUrl(art, 0) && (
        <>
          <div className="muted small">{p.faceChosen ? `Смена лица — ${GOLD_PRICES.faceChange} 🪙` : 'Первый выбор бесплатный'}</div>
          <div className="face-grid">
            {Array.from({ length: FACE_COUNT }, (_, i) => (
              <button
                key={i}
                className={p.face === i ? 'active' : ''}
                disabled={busy}
                onClick={async () => {
                  if (p.face === i && p.faceChosen) return;
                  if (p.faceChosen && !confirm(`Сменить лицо за ${GOLD_PRICES.faceChange} 🪙?`)) return;
                  if ((await act('face', { face: i })) !== null) toast('Новое лицо');
                }}
              >
                <img src={faceUrl(art, i)!} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}

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
                <span className="swatch" style={{ filter: s.filter || undefined }} /> {s.name}
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
