import { useEffect, useRef, useState } from 'react';
import { ESCAPE, ESCAPE_STAGES, escapeReward } from '../shared/events.ts';
import { EscapeScene } from './art/PlaceScenes.tsx';
import { Place } from './art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { itemLabel } from './Perks.tsx';
import { fmt, lookOf, timeLeft, useGame } from './game.tsx';

type Phase = 'intro' | 'play' | 'passed' | 'caught' | 'bailed';
interface EndResult {
  caught: boolean;
  stage: number;
  reward: { money: number; xp: number; authority: number; gold: number; item: string | null };
}

/** Побег: этап за этапом, мини-игра на каждом. Не удаётся никогда — но чем дальше, тем больше «за дерзость». */
export function Escape({ onBack }: { onBack(): void }) {
  const { p, now, act, toast } = useGame();
  const running = p.escape.stage !== null;
  const [phase, setPhase] = useState<Phase>(running ? 'passed' : 'intro');
  const [end, setEnd] = useState<EndResult | null>(null);
  const stageIdx = Math.min(p.escape.stage ?? end?.stage ?? 0, ESCAPE_STAGES.length - 1);
  const st = ESCAPE_STAGES[stageIdx];
  const look = lookOf(p);
  const omon = useNpc('sheet/cast/omon');
  const moving = phase === 'play' || phase === 'passed';
  const locked = p.escape.cdUntil > now && !running;

  const start = async () => {
    if ((await act('escapeStart')) === null) return;
    setEnd(null);
    setPhase('play');
  };
  const step = async (quality: number) => {
    const r = await act<{ passed: boolean; stage: number } & Partial<EndResult>>('escapeStep', { quality });
    if (!r) return;
    if (r.passed) setPhase('passed');
    else {
      setEnd(r as EndResult);
      setPhase('caught');
    }
  };
  const bail = async () => {
    const r = await act<EndResult>('escapeBail');
    if (!r) return;
    setEnd(r);
    setPhase('bailed');
  };

  const passedStages = phase === 'caught' || phase === 'bailed' ? end?.stage ?? 0 : p.escape.stage ?? 0;
  const sceneStage = phase === 'intro' ? 'tunnel' : phase === 'passed' ? ESCAPE_STAGES[Math.max(0, stageIdx - 1)].id : st.id;
  const pose = phase === 'caught' ? 'floor' : phase === 'bailed' ? 'crossed' : null;

  return (
    <>
      <div className="scene-wrap">
        <EscapeScene stage={sceneStage} alarm={phase === 'caught'}>
          <Place x={phase === 'play' ? 110 : phase === 'caught' ? 160 : 150} y={262} scale={0.86} className={moving ? 'esc-run' : ''}>
            {pose ? <PoseG name={pose} look={look} /> : <PoseG name="walk1" anim={phase === 'play' ? 'run' : 'walk'} look={look} />}
          </Place>
          {phase === 'caught' && omon && (
            <Place x={270} y={262} scale={0.92}>
              <ImageG url={omon.url} height={omon.height} mirror />
            </Place>
          )}
        </EscapeScene>
        <div className="scene-tag">🏃 Побег{phase !== 'intro' ? ` · этап ${Math.min(passedStages + (phase === 'play' ? 1 : 0), ESCAPE_STAGES.length)}/${ESCAPE_STAGES.length}` : ''}</div>
        {!running && (
          <button className="place-back" onClick={onBack}>
            ← На зону
          </button>
        )}
      </div>

      <div className="esc-track">
        {ESCAPE_STAGES.map((s, i) => (
          <span key={s.id} className={i < passedStages ? 'done' : i === passedStages && phase === 'play' ? 'now' : ''} title={s.name}>
            {i < passedStages ? '✓' : i + 1}
          </span>
        ))}
      </div>

      {phase === 'intro' && (
        <div className="card">
          <b>Уйти в побег</b>
          <p className="muted small">
            Девять этапов: подкоп, двор, прожектор, собаки, колючка, забор, тайга, трасса, вокзал. На каждом — мини-игра: чем точнее, тем выше шанс. Сбежать не
            удавалось ещё никому — но чем дальше уйдёшь, тем больше уважения и награда. Можно вернуться раньше: {ESCAPE.bailShare * 100}% награды без ШИЗО.
          </p>
          <div className="esc-rewards">
            {[2, 4, 6, 8].map((n) => {
              const r = escapeReward(p.level, n);
              return (
                <div key={n}>
                  <b>{n} эт.</b> {fmt(r.money)} ₽ · +{r.authority} 🎖️{r.gold ? ` · ${r.gold} 🪙` : ''}
                </div>
              );
            })}
          </div>
          <div className="muted small">Рекорд: {p.escape.best} эт.</div>
          <button className="btn btn-wide btn-red" disabled={locked} onClick={start}>
            {locked ? `ШИЗО ещё ${timeLeft(p.escape.cdUntil - now)}` : `Бежать ⚡${ESCAPE.energy}`}
          </button>
        </div>
      )}

      {phase === 'play' && <StageGame key={stageIdx} kind={st.game} name={st.name} text={st.text} onDone={step} />}

      {phase === 'passed' && (
        <div className="card center">
          <b>✅ {ESCAPE_STAGES[Math.max(0, stageIdx - 1)].name} — позади!</b>
          <p className="muted small">Дальше: {st.name}. Сейчас вернёшься — {fmt(Math.round(escapeReward(p.level, p.escape.stage ?? 0).money * ESCAPE.bailShare))} ₽.</p>
          <div className="row gap">
            <button className="btn btn-wide btn-red" onClick={() => setPhase('play')}>
              Дальше ▶
            </button>
            <button className="btn btn-wide btn-dark" onClick={bail}>
              Вернуться
            </button>
          </div>
        </div>
      )}

      {(phase === 'caught' || phase === 'bailed') && end && (
        <div className="card center result-in">
          <h2 className={phase === 'caught' ? 'lose' : 'win'}>{phase === 'caught' ? `🚨 Пойман: ${ESCAPE_STAGES[Math.min(end.stage, ESCAPE_STAGES.length - 1)].name}` : '🤫 Вернулся тихо'}</h2>
          <p className="muted small">
            {phase === 'caught'
              ? end.stage >= ESCAPE_STAGES.length - 1
                ? 'Уже держал билет в руке… Наряд на перроне. Легенда зоны!'
                : `Дошёл до ${end.stage} этапа. Побои и ШИЗО на ${ESCAPE.cooldownMin / 60} ч, зато о тебе говорит вся зона.`
              : 'Лёг на шконку, будто и не уходил.'}
          </p>
          <div className="rewards">
            <div>+{fmt(end.reward.money)} ₽ · +{end.reward.xp} опыта · +{end.reward.authority} авторитета</div>
            {end.reward.gold > 0 && <div>+{end.reward.gold} 🪙</div>}
            {end.reward.item && <div>🎒 {itemLabel(end.reward.item)}</div>}
          </div>
          <button className="btn btn-wide" onClick={() => setPhase('intro')}>
            Ясно
          </button>
        </div>
      )}
    </>
  );
}

/** Мини-игры этапа: «поймай момент» или «жми быстрее». */
function StageGame({ kind, name, text, onDone }: { kind: 'timing' | 'mash' | 'hold'; name: string; text: string; onDone(q: number): void }) {
  const [pos, setPos] = useState(0);
  const [zone] = useState(() => 0.25 + Math.random() * 0.5);
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const done = useRef(false);
  const MASH_MS = 3000;
  const MASH_GOAL = 18;

  useEffect(() => {
    if (kind !== 'timing') return;
    let raf = 0;
    const t0 = performance.now();
    const speed = 0.9 + Math.random() * 0.5;
    const tick = (t: number) => {
      const x = ((t - t0) / 1000) * speed;
      setPos(1 - Math.abs((x % 2) - 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind]);

  // отсчёт от дедлайна, а не цепочкой таймеров — не отстаёт при частых нажатиях
  const endAt = useRef(0);
  const tapsRef = useRef(0);
  tapsRef.current = taps;
  const started = left !== null;
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const l = endAt.current - performance.now();
      setLeft(Math.max(0, l));
      if (l <= 0 && !done.current) {
        done.current = true;
        clearInterval(id);
        onDone(Math.min(1, tapsRef.current / MASH_GOAL));
      }
    }, 100);
    return () => clearInterval(id);
  }, [started, onDone]);

  const finish = (q: number) => {
    if (done.current) return;
    done.current = true;
    onDone(q);
  };

  return (
    <div className="card center">
      <b>{name}</b>
      <p className="muted small">{text}</p>
      {kind === 'timing' ? (
        <>
          <div className="esc-bar">
            <div className="esc-zone" style={{ left: `${(zone - 0.1) * 100}%`, width: '20%' }} />
            <div className="esc-mark" style={{ left: `${pos * 100}%` }} />
          </div>
          <button className="btn btn-wide btn-red" onClick={() => finish(Math.max(0, 1 - Math.abs(pos - zone) / 0.35))}>
            Сейчас!
          </button>
        </>
      ) : (
        <>
          <div className="esc-bar">
            <div className="esc-fill" style={{ width: `${Math.min(100, (taps / MASH_GOAL) * 100)}%` }} />
          </div>
          <div className="muted small">{left === null ? 'Жми часто — время пойдёт с первого нажатия' : `${(left / 1000).toFixed(1)} с`}</div>
          <button
            className="btn btn-wide btn-red esc-mash"
            onClick={() => {
              if (left === null) {
                endAt.current = performance.now() + MASH_MS;
                setLeft(MASH_MS);
              }
              if (!done.current) setTaps((n) => n + 1);
            }}
          >
            Жми! ({taps})
          </button>
        </>
      )}
    </div>
  );
}
