import type { CatsQuest } from './art/Critters.tsx';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

/** Квест «Прикорми котов зоны»: кто сыт и как покормить. */
export function useCatsQuest(): CatsQuest {
  const { p, act, toast } = useGame();
  return {
    fed: p.catsFed,
    feed: async (id) => {
      const r = await act<{ name: string; fed: number; total: number; gold: number }>('catFeed', { id });
      if (!r) return;
      play('pop');
      toast(r.gold ? `🐈 Вся банда твоя! +${r.gold} 🪙` : `🐟 ${r.name} доволен · котов ${r.fed}/${r.total}`);
    },
  };
}
