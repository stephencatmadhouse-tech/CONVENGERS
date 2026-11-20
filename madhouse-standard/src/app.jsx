const { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } = React;
import { adapter, loadState, nowIso, diff, freshLibrary, freshSamples, canAuthorize } from './store.js';
import { ServicesProvider, Icon, cx, useSvc } from './ui.jsx';
import { Dashboard } from './pages/dashboard.jsx';
import { Library } from './pages/library.jsx';
import { Wizard } from './pages/wizard.jsx';
import { Classification } from './pages/classification.jsx';
import { CostEstimator } from './pages/cost.jsx';
import { QAInspection } from './pages/qa.jsx';
import { Reports } from './pages/reports.jsx';
import { Settings } from './pages/settings.jsx';

export const LIB_FIELDS = ['id', 'category', 'catCode', 'subcategory', 'item', 'description', 'symptoms', 'causes', 'inspection', 'method',
  'minorCriteria', 'majorCriteria', 'criticalCriteria', 'trade', 'laborCost', 'materialCost', 'equipmentCost', 'costMin', 'costMax',
  'duration', 'priority', 'classification', 'qaTemplate', 'qaVerification', 'warrantyNotes', 'sourceRef', 'scaleToId'];

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['library', 'Defect & Repair Library', 'library'],
  ['assess', 'Assessment Wizard', 'wizard'],
  ['classification', 'Repair Classification', 'classify'],
  ['cost', 'Cost Estimator', 'cost'],
  ['qa', 'QA Inspection', 'qa'],
  ['reports', 'Reports', 'reports'],
  ['preferences', 'Settings', 'settings'],
];
const ROUTES = NAV.map((n) => n[0]);

function AppProvider({ children }) {
  const initial = useMemo(() => loadState(), []);
  const [library, setLibrary] = useState(initial.library);
  const [assessments, setAssessments] = useState(initial.assessments);
  const [settings, setSettings] = useState(initial.settings);
  const [saveError, setSaveError] = useState('');
  const first = useRef(true);
  const [route, setRoute] = useState(() => { const h = location.hash.slice(1); return ROUTES.includes(h) ? h : 'dashboard'; });
  const [params, setParams] = useState({});

  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1); if (ROUTES.includes(h)) setRoute(h); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Persist on change (the initial render writes the seed so a reload keeps the same IDs and timestamps).
  useEffect(() => {
    const results = [adapter.save('library', library), adapter.save('assessments', assessments), adapter.save('settings', settings)];
    const bad = results.find((r) => !r.ok);
    setSaveError(!bad ? '' : bad.reason === 'quota' ? 'Browser storage is full. Remove photos or export a backup; recent changes may not be kept after reload.'
      : bad.reason === 'unavailable' ? 'Browser storage is unavailable in this view. Changes last only until the page is closed.' : 'Changes could not be saved to browser storage.');
    first.current = false;
  }, [library, assessments, settings]);

  const go = useCallback((r, p = {}) => {
    setParams(p); setRoute(r);
    try { if (location.hash.slice(1) !== r) history.replaceState(null, '', '#' + r); } catch (e) { /* ignore */ }
    const main = document.querySelector('.main'); if (main) main.scrollTop = 0; window.scrollTo(0, 0);
  }, []);

  const who = `${settings.user.name || 'Unnamed user'} (${settings.user.role})`;

  const saveItem = useCallback((item, prevId) => {
    const at = nowIso();
    setLibrary((lib) => {
      const prev = prevId ? lib.find((x) => x.id === prevId) : null;
      if (prev) {
        const changes = diff(prev, item, LIB_FIELDS);
        if (!changes.length) return lib;
        const next = { ...prev, ...item, updatedAt: at, modifiedBy: who, history: [...(prev.history || []), { at, by: who, action: 'Edited', changes }] };
        return lib.map((x) => (x.id === prevId ? next : x));
      }
      return [...lib, { ...item, sourceRef: item.sourceRef || 'MS-USER', crcRefs: [], createdAt: at, updatedAt: at, modifiedBy: who, history: [{ at, by: who, action: 'Created' }] }];
    });
  }, [who]);
  const deleteItem = useCallback((id) => setLibrary((lib) => lib.filter((x) => x.id !== id)), []);

  const saveAssessment = useCallback((a, action) => {
    const at = nowIso();
    let savedId = a.id;
    setAssessments((list) => {
      const prev = a.id ? list.find((x) => x.id === a.id) : null;
      if (prev) {
        return list.map((x) => (x.id === a.id ? { ...prev, ...a, updatedAt: at, history: [...(prev.history || []), { at, by: who, action: action || 'Updated' }] } : x));
      }
      const year = new Date().getFullYear();
      const nums = list.map((x) => parseInt(String(x.id).split('-')[2], 10)).filter((n) => !Number.isNaN(n));
      savedId = `AS-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
      return [...list, { ...a, id: savedId, createdAt: at, updatedAt: at, history: [{ at, by: who, action: action || 'Created' }] }];
    });
    return savedId;
  }, [who]);
  const deleteAssessment = useCallback((id) => setAssessments((l) => l.filter((x) => x.id !== id)), []);

  const value = {
    library, assessments, settings, saveError, route, params, go, who,
    authorized: canAuthorize(settings.user.role),
    saveItem, deleteItem, saveAssessment, deleteAssessment,
    setSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
    resetLibrary: () => setLibrary(freshLibrary()),
    resetSamples: () => setAssessments((l) => [...l.filter((x) => !x.sample), ...freshSamples(library)]),
    clearSamples: () => setAssessments((l) => l.filter((x) => !x.sample)),
    importBackup: (obj) => {
      if (Array.isArray(obj.library)) setLibrary(obj.library);
      if (Array.isArray(obj.assessments)) setAssessments(obj.assessments);
      if (obj.settings) setSettings((s) => ({ ...s, ...obj.settings }));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Shell() {
  const app = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const page = {
    dashboard: <Dashboard />, library: <Library />, assess: <Wizard key={app.params.assessmentId || app.params.itemId || 'new'} />,
    classification: <Classification />, cost: <CostEstimator key={app.params.assessmentId || app.params.itemId || 'cost'} />,
    qa: <QAInspection key={app.params.assessmentId || 'qa'} />, reports: <Reports />, preferences: <Settings />,
  }[app.route];
  const current = NAV.find((n) => n[0] === app.route);
  const critOpen = app.assessments.filter((a) => (a.validation?.finalClass || a.result?.classification) === 'Critical' && a.status !== 'Completed').length;
  return (
    <div className="shell">
      <aside className={cx('side', navOpen && 'open')}>
        <div className="brand">
          <div className="mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="brand-text"><b>MADHOUSE</b><span>STANDARD</span></div>
          <button className="icon-btn nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation"><Icon name="menu" /></button>
        </div>
        <nav onClick={() => setNavOpen(false)}>
          {NAV.map(([r, label, icon]) => (
            <button key={r} className={cx('nav-item', app.route === r && 'on')} onClick={() => app.go(r)} aria-current={app.route === r ? 'page' : undefined}>
              <Icon name={icon} /><span>{label}</span>
              {r === 'classification' && critOpen > 0 && <em className="nav-alert" title="Open critical works">{critOpen}</em>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span>Interior Fit-Out Defect &amp; Repair Classification System</span>
          <span className="wm">Created by Ar. Stephen Catabijan / QQA</span>
        </div>
      </aside>
      <main className="main">
        <header className="top">
          <div>
            <div className="eyebrow">Quality Assurance | Warranty Management | Repair Cost Assessment</div>
            <h1>{current ? current[1] : ''}</h1>
          </div>
          <div className="top-meta">
            <button className="user-chip" onClick={() => app.go('preferences')} title="Change user and role in Settings">
              <b>{app.settings.user.name || 'Set your name'}</b><span>{app.settings.user.role}</span>
            </button>
          </div>
        </header>
        {app.saveError && <div className="banner banner-warn"><Icon name="alert" /> {app.saveError}</div>}
        {critOpen > 0 && app.route === 'dashboard' && (
          <div className="banner banner-crit" role="alert"><Icon name="alert" />
            <span><b>{critOpen} open Critical Works {critOpen === 1 ? 'record' : 'records'}.</b> Safety escalation and specialist assessment are required.</span>
            <button className="btn btn-sm" onClick={() => app.go('classification', { filter: 'Critical' })}>Review</button>
          </div>
        )}
        <div className="page">{page}</div>
        <footer className="foot">
          <span>MADHOUSE STANDARD · Interior Fit-Out Defect &amp; Repair Classification System · v1.0</span>
          <span className="wm">Created by Ar. Stephen Catabijan / QQA</span>
        </footer>
      </main>
    </div>
  );
}

export function App() {
  return <ServicesProvider><AppProvider><Shell /></AppProvider></ServicesProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
