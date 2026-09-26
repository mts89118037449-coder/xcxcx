import { GOLD_PRICES, JOBS, STAT_NAMES, trainCost, type Stat } from '../../shared/content.ts';
import { Stage } from '../art/Stage.tsx';
import { useTalk } from '../Talk.tsx';
import { Dailies, Quests } from '../Tasks.tsx';
import { Card, Price, fmt, lookOf, useAnim, useGame } from '../game.tsx';

const STAT_HINT: Record<Stat, string> = {
  str: '+3 к атаке',
  agi: '+2 к защите, крит',
  end: '+12 к здоровью',
};

export function Work() {
  const { p, act, toast, busy } = useGame();
  const talk = useTalk();
  const [anim, animKey, play] = useAnim();

  const work = async (jobId: string) => {
    const r = await act<{ money: number; xp: number; levelUps: number }>('job', { jobId });
    if (!r) return;
    play(r.levelUps ? 'act-cheer' : 'act-work');
    toast(`+${fmt(r.money)} ₽, +${r.xp} опыта${r.levelUps ? ' · НОВЫЙ УРОВЕНЬ!' : ''}`);
  };

  const pump = async (type: 'allocate' | 'train', stat: Stat) => {
    if ((await act(type, { stat })) !== null) play('act-work');
  };

  return (
    <>
      <div className="scene-wrap">
        <Stage onTalk={talk} loc="work" look={lookOf(p)} mood={p.hp < p.stats.maxHp * 0.3 ? 'hurt' : 'idle'} anim={anim} animKey={animKey} />
        <div className="scene-tag">⚒️ Промзона</div>
      </div>
      <Dailies />
      <Quests />
      <h3 className="section">Навыки</h3>
      <Card>
        <h3>Прокачка {p.statPoints > 0 && <span className="badge">{p.statPoints} очк.</span>}</h3>
        {(Object.keys(STAT_NAMES) as Stat[]).map((s) => (
          <div className="row line" key={s}>
            <div>
              <b>{STAT_NAMES[s]}: {p[s]}</b>
              <div className="muted">{STAT_HINT[s]}</div>
            </div>
            <div className="row gap-s">
              {p.statPoints > 0 && (
                <button className="btn btn-s" disabled={busy} onClick={() => pump('allocate', s)}>+1</button>
              )}
              <button className="btn btn-s btn-dark" disabled={busy || p.money < trainCost(p[s])} onClick={() => pump('train', s)}>
                🏋️ <Price amount={trainCost(p[s])} currency="money" />
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn btn-link"
          disabled={busy}
          onClick={() => confirm(`Сбросить навыки за ${GOLD_PRICES.statReset} 🪙? Все вложенные очки вернутся.`) && act('statReset')}
        >
          Перераспределить навыки · {GOLD_PRICES.statReset} 🪙
        </button>
      </Card>

      <h3 className="section">Работа</h3>
      {JOBS.map((j) => {
        const locked = p.level < j.minLevel;
        return (
          <Card key={j.id} className={locked ? 'locked' : ''}>
            <div className="row">
              <div>
                <b>{j.emoji} {j.name}</b>
                <div className="muted">
                  {locked ? `🔒 с ${j.minLevel} уровня` : `${fmt(j.money[0])}–${fmt(j.money[1])} ₽ · ${j.xp} опыта`}
                </div>
              </div>
              <button className="btn" disabled={locked || busy || p.energy < j.energy} onClick={() => work(j.id)}>
                ⚡{j.energy}
              </button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
