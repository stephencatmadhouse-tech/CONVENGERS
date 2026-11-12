import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './theme-palette.css';
import './theme-status.css';

createRoot(document.getElementById('root')!).render(<App />);
