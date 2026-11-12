import {createRoot} from 'react-dom/client';
import Root from './Root.tsx';
import './index.css';
import './theme-palette.css';
import './theme-status.css';

createRoot(document.getElementById('root')!).render(<Root />);
