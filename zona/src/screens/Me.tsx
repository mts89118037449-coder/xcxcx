import { Suspense, useState } from 'react';
import { named } from '../lazy.ts';
import { SegBar, useSeg } from '../Seg.tsx';
import { useGame } from '../game.tsx';
import { todo } from '../todo.ts';
import { Hint } from '../Hint.tsx';

const ProfilePanel = named(() => import('../Profile.tsx'), 'ProfilePanel');
const Gear = named(() => import('./Gear.tsx'), 'Gear');
const MastPicker = named(() => import('../Term.tsx'), 'MastPicker');

/** Вкладка «Я»: профиль со всеми личными делами плитками и шмот. */
export function Me() {
  const { p, now } = useGame();
  const [seg, setSeg] = useSeg('me', 'me', ['me', 'gear'] as const);
  const [mastOpen, setMastOpen] = useState(false);
  const unread = p.inbox.filter((m) => !m.read).length;
  return (
    <>
      <Hint id="me" icon="👤">
        <b>Всё личное здесь:</b> профиль и срок, почта, родня, заочница, кольщик, подкоп, питомец. Шмот и наколки — во второй вкладке.
      </Hint>
      <SegBar
        value={seg}
        onChange={setSeg}
        items={[
          { id: 'me', icon: '👤', label: 'Профиль', badge: unread || todo(p, now).sections.me.me },
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
