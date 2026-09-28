import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { RigGallery } from './art/rig/Gallery.tsx';
import './styles.css';

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.setHeaderColor?.('#15130f');
tg?.setBackgroundColor?.('#15130f');

const rigDebug = new URLSearchParams(location.search).has('rig');
createRoot(document.getElementById('root')!).render(rigDebug ? <RigGallery /> : <App />);
