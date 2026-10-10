import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { hideBoot } from './boot.ts';
import type { PlayerView } from '../shared/types.ts';
import { api, ApiError, tg } from './api.ts';
import { Face } from './art/sprites.tsx';
import { DialogBox } from './Dialog.tsx';
import { EventButton } from './EventsLite.tsx';
import type { Mini } from './Minigames.tsx';
import { MAST_RULES } from '../shared/term.ts';
import { frameClass } from './cosmetic.ts';
import { play, setMusicTheme, type Theme } from './sound.ts';
import { isNight } from '../shared/time.ts';
import { GuideBar } from './Guide.tsx';
import { UnlockModal, freshUnlocks } from './Unlocks.tsx';
import type { PlaceId } from '../shared/places.ts';
import { FxLayer, gainsOf, type FxChip } from './Fx.tsx';
import { Bar, GameCtx, fmt, fmtShort, lookOf, timeLeft, useNow, type DialogSpec, type FightLog, type Game, type Place as PlaceT, type Tab } from './game.tsx';
import { logError, noteFailure } from './errlog.ts';
import { LiveBanner } from './Live.tsx';
import { setSceneColony } from './art/Weather.tsx';
import { named } from './lazy.ts';
import { Home } from './screens/Home.tsx';
import { initBack, setBackFallback, useBack } from './Nav.tsx';
import { todo } from './todo.ts';

// Пять разделов внизу: Хата, Зона, Дела (работа и игры), Бой (и братва), Я (профиль и шмот). «Ларёк» — ⭐ в шапке.
// Окна, которые открываются не сразу, — отдельными кусками: первый запуск в Telegram быстрее.
const VisitModal = named(() => import('./Visit.tsx'), 'VisitModal');
const ShellGame = named(() => import('./Shells.tsx'), 'ShellGame');
const Church = named(() => import('./Church.tsx'), 'Church');
const Pullups = named(() => import('./Pullups.tsx'), 'Pullups');
const Medic = named(() => import('./Medic.tsx'), 'Medic');
const Escape = named(() => import('./Escape.tsx'), 'Escape');
const PlaceScreen = named(() => import('./Places.tsx'), 'PlaceScreen');
const EventStage = named(() => import('./Events.tsx'), 'EventStage');
const FightModal = named(() => import('./FightModal.tsx'), 'FightModal');
const BattleModal = named(() => import('./Battle.tsx'), 'BattleModal');
// вкладки, кроме хаты, — по требованию: первый экран грузится быстрее
const Zone = named(() => import('./screens/Zone.tsx'), 'Zone');
const Work = named(() => import('./screens/Work.tsx'), 'Work');
const Fight = named(() => import('./screens/Fight.tsx'), 'Fight');
const Me = named(() => import('./screens/Me.tsx'), 'Me');
const Top = named(() => import('./screens/Top.tsx'), 'Top');
const Shop = named(() => import('./screens/Shop.tsx'), 'Shop');
const AdminPanel = named(() => import('./Admin.tsx'), 'AdminPanel');
const IntroOverlay = named(() => import('./Intro.tsx'), 'IntroOverlay');
const MastPicker = named(() => import('./Term.tsx'), 'MastPicker');
const CardsGame = named(() => import('./Minigames.tsx'), 'CardsGame');
const RaceGame = named(() => import('./Minigames.tsx'), 'RaceGame');
const BrewGame = named(() => import('./Minigames.tsx'), 'BrewGame');
const RaidGame = named(() => import('./Raid.tsx'), 'RaidGame');
const DiceGame = named(() => import('./Minigames.tsx'), 'DiceGame');
const ArmGame = named(() => import('./Minigames.tsx'), 'ArmGame');
const DartsGame = named(() => import('./Minigames.tsx'), 'DartsGame');
const NardyGame = named(() => import('./Minigames2.tsx'), 'NardyGame');
const DominoGame = named(() => import('./Minigames2.tsx'), 'DominoGame');
const ChessGame = named(() => import('./Minigames2.tsx'), 'ChessGame');
const SpeedGame = named(() => import('./Minigames2.tsx'), 'SpeedGame');
const ConveyorGame = named(() => import('./Minigames2.tsx'), 'ConveyorGame');
const BeadsGame = named(() => import('./Minigames2.tsx'), 'BeadsGame');
const FishGame = named(() => import('./Minigames2.tsx'), 'FishGame');
const ShizoGame = named(() => import('./Minigames2.tsx'), 'ShizoGame');

const EnergySheet = named(() => import('./Energy.tsx'), 'EnergySheet');
const SearchModal = named(() => import('./Search.tsx'), 'SearchModal');
const TutorialCoach = named(() => import('./Tutorial.tsx'), 'TutorialCoach');
/** Места со своим экраном (без тяжёлого списка мест в первом файле; сверяется тестом). */
export const PLACE_SCREENS = new Set<string>(['bath', 'canteen', 'library', 'club', 'visits', 'factory', 'shizo', 'logging', 'kamera', 'plac']);

const PLACE_MUSIC: Partial<Record<string, Theme>> = {
  bath: 'bath',
  canteen: 'canteen',
  library: 'library',
  club: 'club',
  visits: 'visits',
  factory: 'factory',
  shizo: 'shizo',
  church: 'library',
  logging: 'factory',
  kamera: 'shizo',
  plac: 'club',
  medic: 'visits',
};

const TABS: { id: Tab; icon: string; label: string; also?: Tab[] }[] = [
  { id: 'home', icon: '🏚️', label: 'Хата' },
  { id: 'zone', icon: '🗺️', label: 'Зона' },
  { id: 'work', icon: '⚒️', label: 'Дела' },
  { id: 'fight', icon: '🥊', label: 'Бой', also: ['top'] },
  { id: 'gear', icon: '👤', label: 'Я' },
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
  const [place, setPlace] = useState<Exclude<PlaceT, 'pullups'> | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [battleOn, setBattleOn] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mini, setMini] = useState<Mini | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const hasBattle = !!player?.battle;
  // «Назад» Telegram: мини-игры и места закрываются, со вкладки — домой
  useEffect(initBack, []);
  // соседние вкладки подгружаем заранее, когда игра уже открылась — переход без ожидания
  useEffect(() => {
    const t = setTimeout(() => {
      import('./screens/Zone.tsx');
      import('./screens/Work.tsx');
      import('./screens/Fight.tsx');
      import('./screens/Me.tsx');
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  useBack(() => setMini(null), !!mini);
  useBack(() => setDialog(null), !!dialog);
  useBack(() => setPullOpen(false), pullOpen);
  useBack(() => setShellsOpen(false), shellsOpen);
  useBack(() => setEventId(null), !!eventId);
  useEffect(() => {
    setBackFallback(place ? () => (setPlace(null), setTab('zone')) : tab !== 'home' ? () => setTab('home') : null);
  }, [place, tab]);
  // обучение грузим, только если оно было в этой игре (и держим до конца — там подарок)
  const [tutOn, setTutOn] = useState(false);
  useEffect(() => {
    if (player?.tut) setTutOn(true);
  }, [player?.tut]);
  // музыка под место: свой мотив в каждом месте, в бою — быстрее, ночью — тише и со сверчками
  const musicFor: Theme =
    battleOn || hasBattle || place === 'escape' || tab === 'fight'
      ? 'fight'
      : place && place in PLACE_MUSIC
        ? PLACE_MUSIC[place]!
        : isNight(Date.now())
          ? 'night'
          : 'yard';
  useEffect(() => setMusicTheme(musicFor), [musicFor]);
  if (player) setSceneColony(player.colony);
  // этапирование для новичка и приглашение выбрать масть — по одному разу за заход
  const [introOn, setIntroOn] = useState(false);
  const introPending = (player?.intro ?? -1) >= 0;
  useEffect(() => {
    if (introPending) setIntroOn(true);
  }, [introPending]);
  const [mastAsked, setMastAsked] = useState(false);
  // открытия, которые уже закрыли в этой сессии (пока сервер не подтвердил)
  const [unlockHidden, setUnlockHidden] = useState<string[]>([]);
  useEffect(() => {
    if (hasBattle) setBattleOn(true); // драка началась или игрок вернулся в незаконченную
  }, [hasBattle]);
  const toastTimer = useRef<number>(0);
  const [fx, setFx] = useState<{ chips: FxChip[]; levelUp: boolean; key: number }>({ chips: [], levelUp: false, key: 0 });
  const fxTimer = useRef<number>(0);
  const showFx = useCallback((result: unknown) => {
    const g = gainsOf(result);
    if (!g.chips.length && !g.levelUps) return;
    // звук награды: новый уровень, золото или деньги
    const r = result as { gold?: number } | null;
    play(g.levelUps > 0 ? 'level' : r && typeof r === 'object' && (r.gold ?? 0) > 0 ? 'gold' : 'coin');
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
        play('error');
        if (e instanceof ApiError) noteFailure(`${type}: ${e.message}`);
        else if (e instanceof TypeError && /fetch|network|Load failed/i.test(e.message)) noteFailure(`${type}: нет связи`);
        else if (e instanceof Error) logError(`${type}: ${e.message}`, e.stack ?? '');
        toast(e instanceof ApiError ? e.message : 'Нет связи с сервером', 'err');
        if (e instanceof ApiError && e.message.startsWith('Не хватает энергии')) setEnergyOpen(true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast, showFx],
  );

  if (player || error) hideBoot();
  if (error && !player) {
    return (
      <div className="splash">
        <div className="splash-logo">🔒</div>
        <p>{error}</p>
        <button className="btn" onClick={refresh}>Повторить</button>
      </div>
    );
  }
  // пока грузимся — виден загрузочный экран из index.html
  if (!player) return null;

  const p = player;
  const fresh = freshUnlocks(p.level, [...p.unlocksSeen, ...unlockHidden]);
  const go = (t: Tab) => {
    setTab(t);
    setPlace(null);
    window.scrollTo(0, 0);
  };
  const game: Game = { p, online, botUsername, now, busy, act, refresh, toast, showFight: setFight, go, visit: setVisiting, openEnergy: () => setEnergyOpen(true), say: setDialog, openShells: () => setShellsOpen(true), openPlace: (pl) => (pl === 'pullups' ? setPullOpen(true) : (setPlace(pl), window.scrollTo(0, 0))), openEvent: (id) => setEventId(id ?? p.event?.id ?? null), openMini: setMini };
  const todos = todo(p, now);
  const energyTimer = p.nextEnergyAt ? Math.max(0, p.nextEnergyAt - now) : 0;

  return (
    <GameCtx.Provider value={game}>
      <header className="top">
        <div className="top-row">
          <div className={`top-face-wrap ${frameClass(p.frame)}`} onClick={() => go('gear')}>
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
          <button className="shop-btn search-btn" onClick={() => setSearchOpen(true)} aria-label="Что где" data-tut="search">
            🔍
          </button>
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

      <main key={`${tab}:${place ?? ''}`} className="screen-in">
        {!place && <LiveBanner />}
        {!place && <GuideBar />}
        <Suspense fallback={null}>
        {place === 'church' && <Church onBack={() => { setPlace(null); setTab('zone'); }} />}
        {place === 'medic' && <Medic onBack={() => { setPlace(null); setTab('zone'); }} />}
        {place === 'escape' && <Escape onBack={() => { setPlace(null); setTab('zone'); }} />}
        {place && PLACE_SCREENS.has(place) && <PlaceScreen id={place as PlaceId} onBack={() => { setPlace(null); setTab('zone'); }} />}
        {!place && tab === 'home' && <Home />}
        {!place && tab === 'zone' && <Zone />}
        {!place && tab === 'work' && <Work />}
        {!place && tab === 'fight' && <Fight />}
        {!place && tab === 'gear' && <Me />}
        {!place && tab === 'top' && <Top />}
        {!place && tab === 'shop' && <Shop />}
        </Suspense>
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} data-tut={`tab-${t.id}`} className={tab === t.id || t.also?.includes(tab) ? 'active' : ''} onClick={() => go(t.id)}>
            <span className="tab-icon">
              {t.icon}
              {todos.tabs[t.id] && <i className="dot" />}
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
      {mini === 'raid' && <RaidGame onClose={() => setMini(null)} />}
      {mini === 'dice' && <DiceGame onClose={() => setMini(null)} />}
      {mini === 'arm' && <ArmGame onClose={() => setMini(null)} />}
      {mini === 'darts' && <DartsGame onClose={() => setMini(null)} />}
      {mini === 'nardy' && <NardyGame onClose={() => setMini(null)} />}
      {mini === 'domino' && <DominoGame onClose={() => setMini(null)} />}
      {mini === 'chess' && <ChessGame onClose={() => setMini(null)} />}
      {mini === 'speed' && <SpeedGame onClose={() => setMini(null)} />}
      {mini === 'conveyor' && <ConveyorGame onClose={() => setMini(null)} />}
      {mini === 'beads' && <BeadsGame onClose={() => setMini(null)} />}
      {mini === 'fish' && <FishGame onClose={() => setMini(null)} />}
      {mini === 'shizo' && <ShizoGame onClose={() => setMini(null)} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {introOn && <IntroOverlay onDone={() => setIntroOn(false)} />}
      {!introOn && tutOn && <TutorialCoach tab={tab} />}
      {!introOn && fresh.length > 0 && <UnlockModal list={fresh} onClose={() => setUnlockHidden(fresh.map((u) => u.id))} />}
      {!introOn && !mastAsked && !p.mast && p.level >= MAST_RULES.minLevel && <MastPicker onClose={() => setMastAsked(true)} />}
      {battleOn && <BattleModal onClose={() => setBattleOn(false)} />}
      {eventId && <EventStage id={eventId} onClose={() => setEventId(null)} />}
      {dialog && <DialogBox d={dialog} onClose={() => setDialog(null)} />}
      {pullOpen && <Pullups onClose={() => setPullOpen(false)} />}
      {shellsOpen && <ShellGame onClose={() => setShellsOpen(false)} />}
      {energyOpen && <EnergySheet onClose={() => setEnergyOpen(false)} />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      </Suspense>
      {fight && <FightModal fight={fight} me={fight.me ?? { name: p.name, look: lookOf(p) }} onClose={() => setFight(null)} />}
    </GameCtx.Provider>
  );
}

