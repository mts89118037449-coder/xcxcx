import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.setHeaderColor?.('#15130f');
tg?.setBackgroundColor?.('#15130f');

createRoot(document.getElementById('root')!).render(<App />);
