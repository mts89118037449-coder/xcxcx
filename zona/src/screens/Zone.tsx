import { Suspense, useEffect, useRef, useState } from 'react';
import { named } from '../lazy.ts';

const HolidayCard = named(() => import('../Holiday.tsx'), 'HolidayCard');
const BuildCard = named(() => import('../Build.tsx'), 'BuildCard');
const ContraCard = named(() => import('../Contra.tsx'), 'ContraCard');
const RiotCard = named(() => import('../Riot.tsx'), 'RiotCard');
const SmotrCard = named(() => import('../Elect.tsx'), 'SmotrCard');
const PaperCard = named(() => import('../Paper.tsx'), 'PaperCard');
const NewsChip = named(() => import('../News.tsx'), 'NewsChip');
import { BUTTS } from '../../shared/content.ts';
import { ButtG, Place, ZoneScene } from '../art/Scenes.tsx';
import { ZoneLife } from '../art/Critters.tsx';
import { RADIO } from '../../shared/jokes.ts';
import { ImageG, PoseG, useNpc } from '../art/sprites.tsx';
import { lookOf, timeLeft, useGame } from '../game.tsx';
import { useTalk } from '../Talk.tsx';
import { WeeklyCard } from '../Weekly.tsx';
import { PlaceTiles } from '../Leisure.tsx';
import { SegBar, useSeg } from '../Seg.tsx';
import { play } from '../sound.ts';
import { WeatherTag, useWeather } from '../art/Weather.tsx';
import { DebtCard, FactionCards, ObshakCard } from '../Factions.tsx';
import { Market } from '../Market.tsx';
import { LockedCard } from '../Unlocks.tsx';
import { isOpen } from '../../shared/unlocks.ts';
import { NowChip } from '../Chip.tsx';
import { Hint } from '../Hint.tsx';

type ZonePlace = 'barrack' | 'kiosk' | 'work' | 'medic' | 'yard' | 'church' | 'walk' | 'escape';
/** Куда идёт герой по тапу на здание: к двери, по земле. */
const DOORS: Record<ZonePlace, [number, number]> = {
  barrack: [72, 196], walk: [92, 204], kiosk: [163, 192], church: [168, 186], work: [252, 194], medic: [330, 200], yard: [44, 246], escape: [312, 256],
};
const HOME: [number, number] = [112, 262];
/** Чем дальше от зрителя (выше по экрану), тем мельче. */
const depth = (y: number) => 0.5 + ((y - 186) / 76) * 0.2;

/** Герой идёт к цели: позиция плавно меняется, по приходу — колбэк. */
function useWalker() {
  const [pos, setPos] = useState<{ x: number; y: number; dir: 1 | -1; moving: boolean }>({ x: HOME[0], y: HOME[1], dir: 1, moving: false });
  const raf = useRef(0);
  const cur = useRef(pos);
  cur.current = pos;
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const walk = (to: [number, number], done: () => void) => {
    cancelAnimationFrame(raf.current);
    const from = { x: cur.current.x, y: cur.current.y };
    const dist = Math.hypot(to[0] - from.x, to[1] - from.y);
    const ms = Math.max(350, Math.min(1400, dist * 7));
    const dir: 1 | -1 = to[0] < from.x ? -1 : 1;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setPos({ x: from.x + (to[0] - from.x) * e, y: from.y + (to[1] - from.y) * e, dir, moving: k < 1 });
      if (k < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  };
  const reset = () => setPos({ x: HOME[0], y: HOME[1], dir: 1, moving: false });
  return { pos, walk, reset };
}

/** Громкоговоритель зоны: объявления с чёрным юмором, меняются сами. */
function RadioTicker() {
  const [i, setI] = useState(() => Math.floor(Math.random() * RADIO.length));
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % RADIO.length), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="radio-bar" key={i} onClick={() => setI((x) => (x + 1) % RADIO.length)}>
      {RADIO[i]}
    </div>
  );
}

/** Вся зона: здания ведут на экраны, по земле валяются бычки, барыга меняет их. */
export function Zone() {
  const { p, now, act, go, openPlace, visit } = useGame();
  const talk = useTalk();
  const wx = useWeather();
  const baryga = useNpc('sheet/cast/sport');
  const [taken, setTaken] = useState<number[]>([]);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; n: number }[]>([]);
  const field = p.field.filter((b) => !taken.includes(b.id));
  const [seg, setSeg] = useSeg('zone', 'people', ['people', 'market', 'week'] as const);
  const hero = useWalker();
  const [going, setGoing] = useState<ZonePlace | null>(null);
  const enter = (pl: ZonePlace) => {
    if (pl === 'barrack') go('home');
    else if (pl === 'kiosk') go('shop');
    else if (pl === 'work') go('work');
    else if (pl === 'yard') go('fight');
    else if (pl === 'church') openPlace('church');
    else if (pl === 'walk') visit(0);
    else if (pl === 'escape') openPlace('escape');
    else openPlace('medic');
  };
  // тап по зданию: герой идёт к двери, потом открывается экран; второй тап — сразу
  const goTo = (pl: ZonePlace) => {
    if (going === pl) return enter(pl);
    setGoing(pl);
    play('click');
    hero.walk(DOORS[pl], () => {
      play('pop');
      setTimeout(() => {
        setGoing(null);
        enter(pl);
        hero.reset();
      }, 220);
    });
  };

  const pickUp = async (b: (typeof p.field)[number]) => {
    setTaken((t) => [...t, b.id]);
    play('pop');
    setPops((a) => [...a, { id: b.id, x: b.x * 360, y: b.y * 280, n: b.pack ? BUTTS.packValue : 1 }]);
    setTimeout(() => setPops((a) => a.filter((x) => x.id !== b.id)), 900);
    await act('butt', { id: b.id });
  };

  return (
    <>
      <div className="scene-wrap">
        <ZoneScene
          onPlace={goTo}
        >
          <ZoneLife />
          {going && (
            <g className="go-marker" transform={`translate(${DOORS[going][0]} ${DOORS[going][1]})`}>
              <ellipse rx={12} ry={4} fill="none" stroke="#ffd24a" strokeWidth={2} />
              <path d="M0,-30 L-6,-40 L6,-40 Z" fill="#ffd24a" stroke="#2a1a10" strokeWidth={1} />
            </g>
          )}
          <Place x={hero.pos.x} y={hero.pos.y} scale={depth(hero.pos.y)}>
            <PoseG name="crossed" anim={hero.pos.moving ? 'run' : going ? 'wave' : undefined} mirror={hero.pos.dir < 0} look={lookOf(p)} fx={{ bruise: p.hp < p.stats.maxHp * 0.3, breath: wx.temp < 0 }} sfx={!!going} />
          </Place>
          {baryga && (
            <g className="npc-click" data-tut="baryga" onClick={() => talk('baryga')}>
              <Place x={196} y={250} scale={0.66}>
                <ImageG url={baryga.url} height={baryga.height} mirror className="char-breathe" />
              </Place>
              <g className="talk-bubble" transform="translate(205 102)">
                <rect x={-14} y={-10} width={28} height={16} rx={8} fill="#f2e6c8" />
                <path d="M-3,6 L0,11 L3,6 Z" fill="#f2e6c8" />
                <text x={0} y={2} fontSize={9} textAnchor="middle">🚬</text>
              </g>
            </g>
          )}
          {field.map((b) => (
            <ButtG key={b.id} x={b.x} y={b.y} pack={b.pack} onPick={() => pickUp(b)} />
          ))}
          {pops.map((pp) => (
            <text key={pp.id} className="butt-pop" x={pp.x} y={pp.y - 6} fontSize={12} textAnchor="middle" fill="#f2c14e">
              +{pp.n} 🚬
            </text>
          ))}
        </ZoneScene>
        <div className="scene-tag">🗺️ Зона · 🚬 {p.butts} · <WeatherTag /></div>
        {wx.effect && <div className="wx-note">{wx.emoji} {wx.effect}</div>}
        <RadioTicker />
      </div>
      {p.nextButtAt && !field.length && <div className="muted small center">🚬 через {timeLeft(p.nextButtAt - now)}</div>}
      <Hint id="zone" icon="🗺️">
        <b>Карта — это меню.</b> Тапай по зданиям или выбирай место в ленте ниже. Вверху <b>🔍</b> — поиск «что где».
      </Hint>
      {/* куда пойти — все места в одну ленту прямо под картой */}
      <div className="place-strip" data-tut="places">
        <PlaceTiles />
      </div>
      {/* сейчас важно: одна лента значков вместо стопки баннеров */}
      <Suspense fallback={null}>
        <div className="now-strip" data-tut="now">
          {p.contra.shmon && <NowChip icon="🔦" label="Шмон!" sub="спрячь товар" hot onClick={() => setSeg('market')} />}
          <NewsChip />
          {p.holiday && <HolidayCard chip />}
          <SmotrCard chip />
          <BuildCard chip />
          <PaperCard chip />
        </div>
        <RiotCard />
      </Suspense>
      <SegBar
        value={seg}
        onChange={setSeg}
        items={[
          { id: 'people', icon: '👥', label: 'Люди' },
          { id: 'market', icon: '🛒', label: 'Рынок', badge: p.contra.shmon },
          { id: 'week', icon: '📅', label: 'Неделя' },
        ]}
      />
      {seg === 'people' &&
        (isOpen('people', p.level) ? (
          <>
            <ObshakCard />
            <DebtCard />
            <FactionCards />
          </>
        ) : (
          <LockedCard id="people" />
        ))}
      {seg === 'market' && (
        <Suspense fallback={null}>
          <ContraCard />
        </Suspense>
      )}
      {seg === 'market' && (isOpen('market', p.level) ? <Market /> : <LockedCard id="market" />)}
      {seg === 'week' && <WeeklyCard />}
    </>
  );
}
