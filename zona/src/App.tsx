import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../shared/types.ts';
import { api, ApiError, tg } from './api.ts';
import { FightArena, type Fighter } from './art/FightArena.tsx';
import { Face } from './art/sprites.tsx';
import { EnergySheet } from './Energy.tsx';
import { DialogBox } from './Dialog.tsx';
import { Zone } from './screens/Zone.tsx';
import { EventButton, EventStage } from './Events.tsx';
import { BattleModal } from './Battle.tsx';
import type { Mini } from './Minigames.tsx';
import { MAST_RULES } from '../shared/term.ts';
import { FxLayer, gainsOf, type FxChip } from './Fx.tsx';
import { Bar, GameCtx, fmt, fmtShort, lookOf, timeLeft, useNow, type DialogSpec, type FightLog, type Game, type Tab } from './game.tsx';
import { Fight } from './screens/Fight.tsx';
import { Gear } from './screens/Gear.tsx';
import { Home } from './screens/Home.tsx';
import { Shop } from './screens/Shop.tsx';
import { Top } from './screens/Top.tsx';
import { Work } from './screens/Work.tsx';

// Пять разделов внизу; «Братва» живёт внутри «Боя», «Ларёк» — кнопкой ⭐ в шапке.
// Окна, которые открываются не сразу, — отдельными кусками: первый запуск в Telegram быстрее.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })));
const VisitModal = named(() => import('./Visit.tsx'), 'VisitModal');
const ShellGame = named(() => import('./Shells.tsx'), 'ShellGame');
const Church = named(() => import('./Church.tsx'), 'Church');
const Pullups = named(() => import('./Pullups.tsx'), 'Pullups');
const Medic = named(() => import('./Medic.tsx'), 'Medic');
const Escape = named(() => import('./Escape.tsx'), 'Escape');
const AdminPanel = named(() => import('./Admin.tsx'), 'AdminPanel');
const IntroOverlay = named(() => import('./Intro.tsx'), 'IntroOverlay');
const MastPicker = named(() => import('./Term.tsx'), 'MastPicker');
const CardsGame = named(() => import('./Minigames.tsx'), 'CardsGame');
const RaceGame = named(() => import('./Minigames.tsx'), 'RaceGame');
const BrewGame = named(() => import('./Minigames.tsx'), 'BrewGame');
const DiceGame = named(() => import('./Minigames.tsx'), 'DiceGame');
const ArmGame = named(() => import('./Minigames.tsx'), 'ArmGame');
const DartsGame = named(() => import('./Minigames.tsx'), 'DartsGame');

const TABS: { id: Tab; icon: string; label: string; also?: Tab[] }[] = [
  { id: 'home', icon: '🏚️', label: 'Хата' },
  { id: 'zone', icon: '🗺️', label: 'Зона' },
  { id: 'work', icon: '⚒️', label: 'Работа' },
  { id: 'fight', icon: '🥊', label: 'Бой', also: ['top'] },
  { id: 'gear', icon: '🎒', label: 'Шмот' },
];

export function App() {
  const [player, setPlayer] = useState<PlayerView | null>(null);
  const [online, setOnline] = useState(0);
  const [botUsername, setBotUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [fight, setFight] = useState<FightLog | null>(null);
  const [visiting, setVisiting] = useState<number | null>(null);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [shellsOpen, setShellsOpen] = useState(false);
  const [place, setPlace] = useState<'church' | 'medic' | 'escape' | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [battleOn, setBattleOn] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mini, setMini] = useState<Mini | null>(null);
  const hasBattle = !!player?.battle;
  // этапирование для новичка и приглашение выбрать масть — по одному разу за заход
  const [introOn, setIntroOn] = useState(false);
  const introPending = (player?.intro ?? -1) >= 0;
  useEffect(() => {
    if (introPending) setIntroOn(true);
  }, [introPending]);
  const [mastAsked, setMastAsked] = useState(false);
  useEffect(() => {
    if (hasBattle) setBattleOn(true); // драка началась или игрок вернулся в незаконченную
  }, [hasBattle]);
  const toastTimer = useRef<number>(0);
  const [fx, setFx] = useState<{ chips: FxChip[]; levelUp: boolean; key: number }>({ chips: [], levelUp: false, key: 0 });
  const fxTimer = useRef<number>(0);
  const showFx = useCallback((result: unknown) => {
    const g = gainsOf(result);
    if (!g.chips.length && !g.levelUps) return;
    setFx((f) => ({ chips: g.chips, levelUp: g.levelUps > 0, key: f.key + 1 }));
    tg?.HapticFeedback?.notificationOccurred('success');
    clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setFx((f) => ({ ...f, chips: [], levelUp: false })), 2400 + g.chips.length * 140);
  }, []);
  const now = useNow();

  const refresh = useCallback(async () => {
    try {
      const r = await api.me();
      setPlayer(r.player);
      setOnline(r.online);
      setBotUsername(r.botUsername);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000); // держим онлайн и регенерацию свежими
    return () => clearInterval(id);
  }, [refresh]);

  const toast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    tg?.HapticFeedback?.notificationOccurred(kind === 'ok' ? 'success' : 'error');
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const act = useCallback(
    async <R,>(type: string, body: Record<string, unknown> = {}): Promise<R | null> => {
      setBusy(true);
      tg?.HapticFeedback?.impactOccurred('light');
      try {
        const r = await api.action<R>(type, body);
        setPlayer(r.player);
        showFx(r.result);
        return r.result;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Нет связи с сервером', 'err');
        if (e instanceof ApiError && e.message.startsWith('Не хватает энергии')) setEnergyOpen(true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast, showFx],
  );

  if (error && !player) {
    return (
      <div className="splash">
        <div className="splash-logo">🔒</div>
        <p>{error}</p>
        <button className="btn" onClick={refresh}>Повторить</button>
      </div>
    );
  }
  if (!player) {
    return (
      <div className="splash">
        <div className="splash-logo">🔒</div>
        <p>Конвой ведёт в хату…</p>
      </div>
    );
  }

  const p = player;
  const go = (t: Tab) => {
    setTab(t);
    setPlace(null);
    window.scrollTo(0, 0);
  };
  const game: Game = { p, online, botUsername, now, busy, act, refresh, toast, showFight: setFight, go, visit: setVisiting, openEnergy: () => setEnergyOpen(true), say: setDialog, openShells: () => setShellsOpen(true), openPlace: (pl) => (pl === 'pullups' ? setPullOpen(true) : (setPlace(pl), window.scrollTo(0, 0))), openEvent: (id) => setEventId(id ?? p.event?.id ?? null), openMini: setMini };
  const energyTimer = p.nextEnergyAt ? Math.max(0, p.nextEnergyAt - now) : 0;

  return (
    <GameCtx.Provider value={game}>
      <header className="top">
        <div className="top-row">
          <div className="top-face-wrap" onClick={() => go('gear')}>
            <Face face={p.face} skin={p.skin} hat={p.equipped.head} size={48} className="top-face" />
            <b className="top-lvl">{p.level}</b>
          </div>
          <div className="who">
            <div className="who-name">
              <b>
                {p.vipUntil ? '👑 ' : ''}
                {p.name}
              </b>
              {p.admin && (
                <button className={`god-chip ${p.god ? 'on' : ''}`} onClick={() => setAdminOpen(true)}>
                  {p.god ? '⚡ бог' : '⚙️'}
                </button>
              )}
            </div>
            <div className="wallet">
              <span className="coin">{fmtShort(p.money)} ₽</span>
              <span className="coin" onClick={() => go('zone')}>{fmtShort(p.butts)} 🚬</span>
              <span className="coin gold" onClick={() => go('shop')}>
                {fmtShort(p.gold)} 🪙<b className="plus">+</b>
              </span>
            </div>
          </div>
          <button className={`shop-btn ${tab === 'shop' ? 'on' : ''}`} onClick={() => go('shop')} aria-label="Ларёк">
            ⭐
          </button>
        </div>
        <div className="bars">
          <Bar kind="hp" value={p.hp} max={p.stats.maxHp} label={`❤️ ${fmt(p.hp)}`} />
          <div onClick={() => setEnergyOpen(true)} style={{ cursor: 'pointer' }}>
            <Bar kind="en" value={p.energy} max={p.stats.maxEnergy} label={`⚡ ${p.energy}/${p.stats.maxEnergy}${energyTimer ? ` · ${timeLeft(energyTimer)}` : ''}`} />
          </div>
          <Bar kind="xp" value={p.xp} max={p.xpNext} label={`⭐ ${Math.floor((p.xp / Math.max(1, p.xpNext)) * 100)}%`} />
        </div>
      </header>

      <main>
        <Suspense fallback={null}>
        {place === 'church' && <Church onBack={() => { setPlace(null); setTab('zone'); }} />}
        {place === 'medic' && <Medic onBack={() => { setPlace(null); setTab('zone'); }} />}
        {place === 'escape' && <Escape onBack={() => { setPlace(null); setTab('zone'); }} />}
        {!place && tab === 'home' && <Home />}
        {!place && tab === 'zone' && <Zone />}
        {!place && tab === 'work' && <Work />}
        {!place && tab === 'fight' && <Fight />}
        {!place && tab === 'gear' && <Gear />}
        {!place && tab === 'top' && <Top />}
        {!place && tab === 'shop' && <Shop />}
        </Suspense>
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id || t.also?.includes(tab) ? 'active' : ''} onClick={() => go(t.id)}>
            <span className="tab-icon">
              {t.icon}
              {t.id === 'work' && p.statPoints > 0 && <i className="dot" />}
              {t.id === 'home' && now >= p.dailyReadyAt && <i className="dot" />}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <EventButton />
      <FxLayer key={fx.key} chips={fx.chips} levelUp={fx.levelUp} />
      {toastMsg && <div className={`toast toast-${toastMsg.kind}`}>{toastMsg.text}</div>}

      <Suspense fallback={null}>
      {visiting !== null && <VisitModal id={visiting} onClose={() => setVisiting(null)} />}
      {mini === 'cards' && <CardsGame onClose={() => setMini(null)} />}
      {mini === 'race' && <RaceGame onClose={() => setMini(null)} />}
      {mini === 'brew' && <BrewGame onClose={() => setMini(null)} />}
      {mini === 'dice' && <DiceGame onClose={() => setMini(null)} />}
      {mini === 'arm' && <ArmGame onClose={() => setMini(null)} />}
      {mini === 'darts' && <DartsGame onClose={() => setMini(null)} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {introOn && <IntroOverlay onDone={() => setIntroOn(false)} />}
      {!introOn && !mastAsked && !p.mast && p.level >= MAST_RULES.minLevel && <MastPicker onClose={() => setMastAsked(true)} />}
      {battleOn && <BattleModal onClose={() => setBattleOn(false)} />}
      {eventId && <EventStage id={eventId} onClose={() => setEventId(null)} />}
      {dialog && <DialogBox d={dialog} onClose={() => setDialog(null)} />}
      {pullOpen && <Pullups onClose={() => setPullOpen(false)} />}
      {shellsOpen && <ShellGame onClose={() => setShellsOpen(false)} />}
      {energyOpen && <EnergySheet onClose={() => setEnergyOpen(false)} />}
      </Suspense>
      {fight && <FightModal fight={fight} me={{ name: p.name, look: lookOf(p) }} onClose={() => setFight(null)} />}
    </GameCtx.Provider>
  );
}

function FightModal({ fight, me, onClose }: { fight: FightLog; me: Fighter; onClose(): void }) {
  const [done, setDone] = useState(false);
  const finish = useCallback(() => {
    setDone(true);
    tg?.HapticFeedback?.notificationOccurred(fight.replay.win ? 'success' : 'error');
  }, [fight]);
  return (
    <div className="modal" onClick={() => done && onClose()}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <FightArena me={me} enemy={fight.enemy} replay={fight.replay} onDone={finish} />
        <div className="muted center">{fight.title}</div>
        {done && (
          <div className="result-in">
            <h2 className={fight.replay.win ? 'win' : 'lose'}>{fight.replay.win ? '🏆 Победа' : '💀 Поражение'}</h2>
            {fight.lines.length > 0 && (
              <div className="rewards">
                {fight.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
            <button className="btn btn-wide" onClick={onClose}>
              Ясно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
