import { useState } from 'react';
import { authHeaderValue, tg } from './api.ts';
import { useGame } from './game.tsx';

export interface ShareCard {
  emoji: string;
  title: string;
  sub: string;
  /** цвет подложки: акцент карточки */
  tone?: 'gold' | 'red' | 'green' | 'pink' | 'blue';
}

const TONES = { gold: ['#3a2a08', '#c9902a'], red: ['#2a0a0a', '#b0302a'], green: ['#0a2a14', '#3a9a4a'], pink: ['#2a0a1a', '#c04a7a'], blue: ['#0a1428', '#3a6ab0'] };

/** Рисуем карточку 720×720: колючка сверху, большой эмодзи, заголовок, игрок, призыв заехать. */
function draw(card: ShareCard, name: string, level: number): Promise<Blob> {
  const S = 720;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const [dark, light] = TONES[card.tone ?? 'gold'];
  const bg = x.createRadialGradient(S / 2, S * 0.42, 40, S / 2, S / 2, S * 0.75);
  bg.addColorStop(0, light);
  bg.addColorStop(1, dark);
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  // кирпич и решётка
  x.globalAlpha = 0.08;
  x.fillStyle = '#000';
  for (let r = 0; r < 24; r++) for (let k = 0; k < 10; k++) x.fillRect(k * 80 + (r % 2) * 40, r * 32, 76, 28);
  x.globalAlpha = 0.18;
  for (let k = 1; k < 8; k++) x.fillRect(k * 90, 0, 8, S);
  x.globalAlpha = 1;
  // колючая проволока
  x.strokeStyle = '#bbb';
  x.lineWidth = 3;
  for (const y of [36, 44]) {
    x.beginPath();
    for (let k = 0; k <= S; k += 20) x.lineTo(k, y + Math.sin(k / 20) * 4);
    x.stroke();
  }
  for (let k = 30; k < S; k += 60) {
    x.beginPath();
    x.moveTo(k - 8, 30);
    x.lineTo(k + 8, 50);
    x.moveTo(k + 8, 30);
    x.lineTo(k - 8, 50);
    x.stroke();
  }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.shadowColor = '#000a';
  x.shadowBlur = 30;
  x.fillText(card.emoji, S / 2, 270);
  x.shadowBlur = 8;
  x.fillStyle = '#fff';
  x.font = '900 58px system-ui, sans-serif';
  wrap(x, card.title, S / 2, 450, S - 80, 62);
  x.fillStyle = '#f2e6c8';
  x.font = '500 32px system-ui, sans-serif';
  wrap(x, card.sub, S / 2, 545, S - 100, 38);
  x.shadowBlur = 0;
  // плашка игрока
  x.fillStyle = '#0009';
  x.fillRect(0, S - 90, S, 90);
  x.fillStyle = '#f2c14e';
  x.font = '800 30px system-ui, sans-serif';
  x.textAlign = 'left';
  x.fillText(`⛓ ${name} · ур. ${level}`, 30, S - 45);
  x.textAlign = 'right';
  x.fillStyle = '#fff';
  x.font = '900 34px system-ui, sans-serif';
  x.fillText('ЗОНА', S - 30, S - 45);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), 'image/jpeg', 0.86));
}

function wrap(x: CanvasRenderingContext2D, text: string, cx: number, y: number, max: number, lh: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (x.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 2).forEach((l, i) => x.fillText(l, cx, y + i * lh - ((Math.min(lines.length, 2) - 1) * lh) / 2));
}

/** Кнопка «Поделиться»: картинка + ссылка-приглашение. В Telegram — выбор чата, иначе — история или ссылка. */
export function ShareButton({ card, caption, className = 'btn btn-wide btn-dark' }: { card: ShareCard; caption: string; className?: string }) {
  const { p, toast } = useGame();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const png = await draw(card, p.name, p.level);
      const res = await fetch(`/api/share?caption=${encodeURIComponent(caption)}`, { method: 'POST', headers: { 'content-type': 'image/jpeg', authorization: authHeaderValue() }, body: png });
      const r = (await res.json()) as { url: string; ref: string; prepared: string | null; error?: string };
      if (!res.ok) throw new Error(r.error ?? 'Не вышло');
      if (r.prepared && tg?.shareMessage) tg.shareMessage(r.prepared, (sent) => sent && toast('📸 Отправлено!'));
      else if (tg?.shareToStory) tg.shareToStory(r.url, { text: caption, widget_link: { url: r.ref, name: 'Играть' } });
      else {
        const link = `https://t.me/share/url?url=${encodeURIComponent(r.ref)}&text=${encodeURIComponent(caption)}`;
        if (tg) tg.openTelegramLink(link);
        else window.open(r.url, '_blank');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вышло', 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className} disabled={busy} onClick={share}>
      {busy ? '📸 Рисуем…' : '📸 Поделиться'}
    </button>
  );
}
