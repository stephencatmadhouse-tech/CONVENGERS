import {createRoot} from 'react-dom/client';
import Root from './Root.tsx';
import { initPwa } from './pwa/pwa.ts';
import './index.css';
import './theme-palette.css';
import './theme-status.css';
import './theme-brand.css';
import './theme-2.css';

createRoot(document.getElementById('root')!).render(<Root />);

initPwa();
