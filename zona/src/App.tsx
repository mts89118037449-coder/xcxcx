import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../shared/types.ts';
import { api, ApiError, tg } from './api.ts';
import { Bar, GameCtx, fmt, timeLeft, useNow, type FightLog, type Game, type Tab } from './game.tsx';
import { Fight } from './screens/Fight.tsx';
import { Gear } from './screens/Gear.tsx';
import { Home } from './screens/Home.tsx';
import { Shop } from './screens/Shop.tsx';
import { Top } from './screens/Top.tsx';
import { Work } from './screens/Work.tsx';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏚️', label: 'Хата' },
  { id: 'work', icon: '⚒️', label: 'Работа' },
  { id: 'fight', icon: '🥊', label: 'Бой' },
  { id: 'gear', icon: '🎒', label: 'Шмот' },
  { id: 'top', icon: '🏆', label: 'Топ' },
  { id: 'shop', icon: '⭐', label: 'Ларёк' },
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
  const toastTimer = useRef<number>(0);
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
        return r.result;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Нет связи с сервером', 'err');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
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
  const game: Game = { p, online, botUsername, now, busy, act, refresh, toast, showFight: setFight, go: setTab };
  const energyTimer = p.nextEnergyAt ? Math.max(0, p.nextEnergyAt - now) : 0;

  return (
    <GameCtx.Provider value={game}>
      <header className="top">
        <div className="top-row">
          <div className="who">
            <b>{p.name}</b>
            <span className="muted">
              {p.vipUntil ? '👑 ' : ''}
              {p.rank} · ур. {p.level}
            </span>
          </div>
          <div className="wallet">
            <span>{fmt(p.money)} ₽</span>
            <span onClick={() => setTab('shop')}>{fmt(p.gold)} 🪙 <b className="plus">+</b></span>
          </div>
        </div>
        <div className="bars">
          <Bar kind="hp" value={p.hp} max={p.stats.maxHp} label={`❤️ ${fmt(p.hp)}/${fmt(p.stats.maxHp)}`} />
          <Bar
            kind="en"
            value={p.energy}
            max={p.stats.maxEnergy}
            label={`⚡ ${p.energy}/${p.stats.maxEnergy}${energyTimer ? ` · ${timeLeft(energyTimer)}` : ''}`}
          />
        </div>
        <Bar kind="xp" value={p.xp} max={p.xpNext} label={`Опыт ${fmt(p.xp)} / ${fmt(p.xpNext)}`} />
      </header>

      <main>
        {tab === 'home' && <Home />}
        {tab === 'work' && <Work />}
        {tab === 'fight' && <Fight />}
        {tab === 'gear' && <Gear />}
        {tab === 'top' && <Top />}
        {tab === 'shop' && <Shop />}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">
              {t.icon}
              {t.id === 'work' && p.statPoints > 0 && <i className="dot" />}
              {t.id === 'home' && now >= p.dailyReadyAt && <i className="dot" />}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {toastMsg && <div className={`toast toast-${toastMsg.kind}`}>{toastMsg.text}</div>}

      {fight && (
        <div className="modal" onClick={() => setFight(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <h2 className={fight.win ? 'win' : 'lose'}>{fight.win ? '🏆 Победа' : '💀 Поражение'}</h2>
            <div className="muted center">{fight.title}</div>
            <ul className="fight-log">
              {fight.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {fight.lines.length > 0 && (
              <div className="rewards">
                {fight.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
            <button className="btn btn-wide" onClick={() => setFight(null)}>Ясно</button>
          </div>
        </div>
      )}
    </GameCtx.Provider>
  );
}
