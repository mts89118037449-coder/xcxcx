import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import { initSound } from './sound.ts';
import { initErrorLog } from './errlog.ts';
import { ErrorBoundary } from './Report.tsx';

initErrorLog();
initSound();

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.setHeaderColor?.('#15130f');
tg?.setBackgroundColor?.('#15130f');

// отладочная галерея рига грузится отдельно и только по ?rig=1
const RigGallery = lazy(() => import('./art/rig/Gallery.tsx').then((m) => ({ default: m.RigGallery })));
const rigDebug = new URLSearchParams(location.search).has('rig');
createRoot(document.getElementById('root')!).render(
  rigDebug ? (
    <Suspense fallback={null}>
      <RigGallery />
    </Suspense>
  ) : (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  ),
);
