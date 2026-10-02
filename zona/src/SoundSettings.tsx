import { useEffect, useState } from 'react';
import { onSoundPrefs, play, setSoundPrefs, soundPrefs } from './sound.ts';

/** Звук и музыка: два переключателя и громкость. Выбор помнится в этом браузере. */
export function SoundSettings() {
  const [p, setP] = useState(soundPrefs());
  useEffect(() => {
    const off = onSoundPrefs(() => setP({ ...soundPrefs() }));
    return () => {
      off();
    };
  }, []);
  return (
    <div className="sound-set">
      <label className="notify-toggle">
        <input type="checkbox" checked={p.sfx} onChange={(e) => (setSoundPrefs({ sfx: e.target.checked }), e.target.checked && play('coin'))} />
        <span>🔊 Звуки: удары, монеты, сигналы</span>
      </label>
      <label className="notify-toggle">
        <input type="checkbox" checked={p.music} onChange={(e) => setSoundPrefs({ music: e.target.checked })} />
        <span>🎸 Музыка: перебор во дворе</span>
      </label>
      <label className="sound-vol">
        <span>Громкость</span>
        <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => setSoundPrefs({ volume: Number(e.target.value) })} onPointerUp={() => play('coin')} />
      </label>
    </div>
  );
}
