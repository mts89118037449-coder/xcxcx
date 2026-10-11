import { PumpkinSpot } from '../Pumpkin.tsx';
import { GOLD_PRICES, JOBS, STAT_NAMES, trainCost, type Stat } from '../../shared/content.ts';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { Dailies, Quests } from '../Tasks.tsx';
import { Price, fmt, lookOf, useAnim, useGame, heroMood } from '../game.tsx';
import { SegBar, useSeg } from '../Seg.tsx';
import { Suspense } from 'react';
import { named } from '../lazy.ts';
import { GameTiles } from '../Leisure.tsx';
import { todo } from '../todo.ts';
import { Hint } from '../Hint.tsx';

const TourneyCard = named(() => import('../Tourney.tsx'), 'TourneyCard');
const WordCard = named(() => import('../Word.tsx'), 'WordCard');
const FootballCard = named(() => import('../Football.tsx'), 'FootballCard');
const QuizCard = named(() => import('../Quiz.tsx'), 'QuizCard');

const STAT_ICON: Record<Stat, string> = { str: '💪', agi: '🤸', end: '🫀' };

export function Work() {
  const { p, now, act, toast, busy } = useGame();
  const dots = todo(p, now).sections.work;
  const talk = useTalk();
  const [anim, animKey, play] = useAnim();
  const [seg, setSeg] = useSeg('work', 'jobs', ['jobs', 'games', 'quests', 'daily', 'gym'] as const);

  const work = async (jobId: string) => {
    const r = await act<{ money: number; xp: number; levelUps: number; bonus: boolean; item: string | null }>('job', { jobId });
    if (!r) return;
    play(r.levelUps ? 'act-cheer' : 'act-work');
    if (r.bonus) toast('💰 Премия ×2!');
  };

  const pump = async (type: 'allocate' | 'train', stat: Stat) => {
    if ((await act(type, { stat })) !== null) play('act-work');
  };

  return (
    <>
      <div className="scene-wrap">
        <Stage onTalk={talk} extra={<PumpkinSpot id="work" x={120} y={258} scale={0.8} />} loc="work" look={lookOf(p)} mood={heroMood(p)} anim={anim} animKey={animKey} />
        <div className="scene-tag">⚒️ Дела: смены, игры, поручения</div>
      </div>
      <Hint id="work" icon="⚒️">
        <b>Дела:</b> смены — за энергию, <b>игры</b> — бесплатно по счётчику, поручения и дела дня — награды. Красная точка — есть что забрать.
      </Hint>
      <SegBar
        value={seg}
        onChange={setSeg}
        items={[
          { id: 'jobs', icon: '⚒️', label: 'Смены' },
          { id: 'games', icon: '🎲', label: 'Игры', badge: dots.games },
          { id: 'quests', icon: '📋', label: 'Поручения', badge: dots.quests },
          { id: 'daily', icon: '✅', label: 'Дела дня', badge: dots.daily },
          { id: 'gym', icon: '💪', label: 'Качалка', badge: p.statPoints || false },
        ]}
      />
      {seg === 'jobs' && (
      <div className="job-grid">
        {JOBS.filter((j, i) => j.minLevel <= p.level || JOBS.findIndex((x) => x.minLevel > p.level) === i).map((j) => {
          const locked = p.level < j.minLevel;
          return (
            <button key={j.id} data-tut={locked ? undefined : 'job'} className={`job-tile ${locked ? 'locked' : ''}`} disabled={locked || busy} onClick={() => work(j.id)}>
              <span className="job-emoji">{locked ? '🔒' : j.emoji}</span>
              <b>{j.name}</b>
              {locked ? <small>ур. {j.minLevel}</small> : <small>₽{fmt(j.money[1])} · ⚡{j.energy}</small>}
            </button>
          );
        })}
      </div>
      )}
      {seg === 'games' && (
        <>
          <Suspense fallback={null}>
            <div className="tile-grid">
              <QuizCard />
              <WordCard />
              <FootballCard />
              <TourneyCard />
            </div>
          </Suspense>
          <GameTiles />
        </>
      )}
      {seg === 'daily' && <Dailies />}
      {seg === 'quests' && <Quests />}
      {seg === 'gym' && (
      <>
      <div className="stat-pump">
        {(Object.keys(STAT_NAMES) as Stat[]).map((s) => (
          <div key={s}>
            <span>{STAT_ICON[s]}</span>
            <b>{p[s]}</b>
            <small>{STAT_NAMES[s]}</small>
            {p.statPoints > 0 ? (
              <button className="btn btn-s" disabled={busy} onClick={() => pump('allocate', s)}>+1</button>
            ) : (
              <button className="btn btn-s btn-dark" disabled={busy || p.money < trainCost(p[s])} onClick={() => pump('train', s)}>
                <Price amount={trainCost(p[s])} currency="money" />
              </button>
            )}
          </div>
        ))}
      </div>
      {p.statPoints > 0 && <div className="center"><span className="badge">{p.statPoints} очк. навыков</span></div>}
      <button
        className="btn btn-link"
        disabled={busy}
        onClick={() => confirm(`Сбросить навыки за ${GOLD_PRICES.statReset} 🪙? Все вложенные очки вернутся.`) && act('statReset')}
      >
        ↺ Сброс навыков · {GOLD_PRICES.statReset} 🪙
      </button>
      </>
      )}
    </>
  );
}
