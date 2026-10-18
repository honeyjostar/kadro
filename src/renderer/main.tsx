import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import * as timeline from '../shared/timeline';
import * as actions from './actions';
import { App } from './components/App';
import { useStore } from './store';

// доступ для автотестов (window.__kadro) — в обычной работе не используется
(window as unknown as { __kadro: unknown }).__kadro = { useStore, actions, timeline };

createRoot(document.getElementById('root')!).render(<App />);
