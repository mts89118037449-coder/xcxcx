import { useRef, useState } from 'react';
import { ModalHead } from './Nav.tsx';
import type { FaceFx, RigAnim } from './art/rig/Rig.tsx';
import { PoseG } from './art/sprites.tsx';
import { lookOf, useGame } from './game.tsx';
import { sendShare } from './Share.tsx';
import { play } from './sound.ts';

const POSES: { anim: RigAnim; icon: string; label: string }[] = [
  { anim: 'proud', icon: '😎', label: 'Гоголем' },
  { anim: 'flex', icon: '💪', label: 'Мышцы' },
  { anim: 'crossed', icon: '🙅', label: 'Руки скрестил' },
  { anim: 'guard', icon: '🥊', label: 'Стойка' },
  { anim: 'punch', icon: '👊', label: 'Удар' },
  { anim: 'kick', icon: '🦶', label: 'Пинок' },
  { anim: 'cheer', icon: '🙌', label: 'Победа' },
  { anim: 'wave', icon: '👋', label: 'Привет' },
  { anim: 'smoke', icon: '🚬', label: 'Перекур' },
  { anim: 'drink', icon: '☕', label: 'Чифир' },
  { anim: 'think', icon: '🤔', label: 'Думает' },
  { anim: 'dance', icon: '🕺', label: 'Пляс' },
  { anim: 'sit', icon: '🪑', label: 'Сидит' },
  { anim: 'sad', icon: '😔', label: 'Тоска' },
];

const FACES: { id: string; icon: string; fx: FaceFx }[] = [
  { id: 'none', icon: '😐', fx: {} },
  { id: 'smile', icon: '😁', fx: { smile: true } },
  { id: 'sweat', icon: '😓', fx: { sweat: true } },
  { id: 'bruise', icon: '🤕', fx: { bruise: true } },
  { id: 'blood', icon: '🩸', fx: { blood: true, bruise: true } },
  { id: 'breath', icon: '🥶', fx: { breath: true } },
];

type Bg = 'cell' | 'yard' | 'gold' | 'night';
const BGS: { id: Bg; icon: string; label: string }[] = [
  { id: 'cell', icon: '🧱', label: 'Хата' },
  { id: 'yard', icon: '🌆', label: 'Двор' },
  { id: 'gold', icon: '✨', label: 'Золото' },
  { id: 'night', icon: '🌙', label: 'Ночь' },
];

const CAPTIONS = ['Привет с зоны!', 'Кто на меня?', 'Режим — не помеха', 'Скоро УДО', 'Хата — огонь', 'Сижу красиво'];

/** Фон кадра на холсте: просто и узнаваемо. */
function paintBg(x: CanvasRenderingContext2D, S: number, bg: Bg) {
  if (bg === 'cell') {
    x.fillStyle = '#5b5348';
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#4a4339';
    for (let r = 0; r < 20; r++) for (let k = 0; k < 9; k++) x.fillRect(k * 90 + (r % 2) * 45, r * 36, 86, 32);
    x.fillStyle = '#3a2a1e';
    x.fillRect(0, S * 0.8, S, S * 0.2);
    // окно с решёткой
    x.fillStyle = '#9ac0e0';
    x.fillRect(S * 0.66, S * 0.12, S * 0.22, S * 0.2);
    x.fillStyle = '#333';
    for (let k = 0; k < 5; k++) x.fillRect(S * 0.66 + k * S * 0.05, S * 0.12, 6, S * 0.2);
  } else if (bg === 'yard') {
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#7aa6c8');
    g.addColorStop(0.6, '#c9d6de');
    g.addColorStop(0.6, '#8a8778');
    g.addColorStop(1, '#6a675a');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#5c5a52';
    x.fillRect(0, S * 0.36, S, S * 0.24);
    x.strokeStyle = '#ccc';
    x.lineWidth = 3;
    for (let k = 0; k < S; k += 26) {
      x.beginPath();
      x.arc(k, S * 0.34, 12, 0, Math.PI * 2);
      x.stroke();
    }
  } else if (bg === 'gold') {
    const g = x.createRadialGradient(S / 2, S * 0.45, 30, S / 2, S / 2, S * 0.75);
    g.addColorStop(0, '#ffd56a');
    g.addColorStop(1, '#5a3a08');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    x.globalAlpha = 0.18;
    x.fillStyle = '#fff';
    for (let k = 0; k < 16; k++) {
      x.beginPath();
      x.moveTo(S / 2, S * 0.45);
      x.arc(S / 2, S * 0.45, S, (k / 16) * Math.PI * 2, ((k + 0.5) / 16) * Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
  } else {
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0b1230');
    g.addColorStop(1, '#2a2a40');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff';
    for (let k = 0; k < 60; k++) x.fillRect((k * 137) % S, (k * 71) % (S * 0.5), 3, 3);
    x.fillStyle = '#f6efc8';
    x.beginPath();
    x.arc(S * 0.8, S * 0.16, 44, 0, Math.PI * 2);
    x.fill();
  }
}

/** Кадр: фон + застывший персонаж + подпись. SVG персонажа рисуем как картинку. */
async function shoot(svg: SVGSVGElement, bg: Bg, caption: string, name: string, level: number): Promise<Blob> {
  const S = 720;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  paintBg(x, S, bg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', '600');
  clone.setAttribute('height', '600');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('Кадр не получился'));
      img.src = url;
    });
    x.drawImage(img, 60, 40, 600, 600);
  } finally {
    URL.revokeObjectURL(url);
  }
  // подпись — как в фотобудке
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = '#000c';
  x.shadowBlur = 10;
  x.fillStyle = '#fff';
  x.font = '900 52px system-ui, sans-serif';
  x.fillText(caption, S / 2, 70);
  x.shadowBlur = 0;
  x.fillStyle = '#0009';
  x.fillRect(0, S - 80, S, 80);
  x.fillStyle = '#f2c14e';
  x.font = '800 30px system-ui, sans-serif';
  x.textAlign = 'left';
  x.fillText(`⛓ ${name} · ур. ${level}`, 26, S - 40);
  x.textAlign = 'right';
  x.fillStyle = '#fff';
  x.font = '900 34px system-ui, sans-serif';
  x.fillText('ЗОНА', S - 26, S - 40);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), 'image/jpeg', 0.88));
}

/** Фото-режим: поза, лицо, фон — и снимок в Telegram. */
export function PhotoModal({ onClose }: { onClose(): void }) {
  const { p, toast } = useGame();
  const [pose, setPose] = useState(0);
  const [face, setFace] = useState(1);
  const [bg, setBg] = useState<Bg>('cell');
  const [cap, setCap] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const snap = async () => {
    if (!ref.current) return;
    setBusy(true);
    setFlash((f) => f + 1);
    play('shutter');
    try {
      const jpg = await shoot(ref.current, bg, CAPTIONS[cap], p.name, p.level);
      await sendShare(jpg, `${CAPTIONS[cap]} — я в игре «Зона». Заходи!`, toast);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вышло', 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title="📸 Фото-режим" />
        <div className={`photo-frame bg-${bg}`}>
          <div className="photo-cap">{CAPTIONS[cap]}</div>
          <svg ref={ref} viewBox="-30 -6 180 222" className="photo-svg">
            <PoseG name="stand" look={lookOf(p)} anim={POSES[pose].anim} fx={FACES[face].fx} startKey={pose} sfx />
          </svg>
          {flash > 0 && <div key={flash} className="photo-flash" />}
        </div>
        <div className="photo-row">
          {POSES.map((x, i) => (
            <button key={x.anim} className={pose === i ? 'active' : ''} onClick={() => setPose(i)} title={x.label}>
              {x.icon}
            </button>
          ))}
        </div>
        <div className="photo-row">
          {FACES.map((x, i) => (
            <button key={x.id} className={face === i ? 'active' : ''} onClick={() => setFace(i)}>
              {x.icon}
            </button>
          ))}
          <span className="photo-sep" />
          {BGS.map((x) => (
            <button key={x.id} className={bg === x.id ? 'active' : ''} onClick={() => setBg(x.id)} title={x.label}>
              {x.icon}
            </button>
          ))}
        </div>
        <div className="chips">
          {CAPTIONS.map((c, i) => (
            <button key={c} className={cap === i ? 'active' : ''} onClick={() => setCap(i)}>
              {c}
            </button>
          ))}
        </div>
        <button className="btn btn-wide btn-gold" disabled={busy} onClick={snap}>
          {busy ? '📸 Снимаем…' : '📸 Снять и отправить'}
        </button>
      </div>
    </div>
  );
}
