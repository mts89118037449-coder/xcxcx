import { Suspense, useState } from 'react';
import { named } from '../lazy.ts';
import { SegBar, useSeg } from '../Seg.tsx';
import { useGame } from '../game.tsx';

const ProfilePanel = named(() => import('../Profile.tsx'), 'ProfilePanel');
const Gear = named(() => import('./Gear.tsx'), 'Gear');
const MastPicker = named(() => import('../Term.tsx'), 'MastPicker');

/** Вкладка «Я»: профиль со всеми личными делами плитками и шмот. */
export function Me() {
  const { p } = useGame();
  const [seg, setSeg] = useSeg('me', 'me', ['me', 'gear'] as const);
  const [mastOpen, setMastOpen] = useState(false);
  const unread = p.inbox.filter((m) => !m.read).length;
  return (
    <>
      <SegBar
        value={seg}
        onChange={setSeg}
        items={[
          { id: 'me', icon: '👤', label: 'Профиль', badge: unread || false },
          { id: 'gear', icon: '🎒', label: 'Шмот и наколки' },
        ]}
      />
      <Suspense fallback={null}>
        {seg === 'me' && <ProfilePanel onMast={() => setMastOpen(true)} />}
        {seg === 'gear' && <Gear />}
        {mastOpen && <MastPicker onClose={() => setMastOpen(false)} />}
      </Suspense>
    </>
  );
}
