const { useState, useRef } = React;
import { useApp } from '../app.jsx';
import { Field, Select, Icon, useSvc } from '../ui.jsx';
import { ROLES, AUTH_ROLES, adapter, firebaseAdapter } from '../store.js';

export function Settings() {
  const app = useApp();
  const svc = useSvc();
  const [user, setUser] = useState(app.settings.user);
  const fileRef = useRef(null);
  const samples = app.assessments.filter((a) => a.sample).length;

  const saveUser = () => {
    if (!user.name.trim()) { svc.toast('Enter your name so changes are attributed', 'warn'); return; }
    app.setSettings({ user: { ...user, name: user.name.trim() } });
    svc.toast('User profile saved');
  };
  const backup = () => svc.exportFile(`madhouse-standard-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: 'madhouse-standard', version: 1, exportedAt: new Date().toISOString(), library: app.library, assessments: app.assessments, settings: app.settings }, null, 1));
  const restore = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const obj = JSON.parse(fr.result);
        if (obj.app !== 'madhouse-standard' || !Array.isArray(obj.library)) throw new Error('not a backup');
        const ids = obj.library.map((x) => x.id);
        if (new Set(ids).size !== ids.length) throw new Error('duplicate IDs');
        const ok = await svc.confirm({ title: 'Restore backup?', message: `Replace the current data with ${obj.library.length} library items and ${(obj.assessments || []).length} assessments from ${obj.exportedAt ? new Date(obj.exportedAt).toLocaleString('en-PH') : 'the file'}?`, confirmLabel: 'Restore', danger: true });
        if (ok) { app.importBackup(obj); svc.toast('Backup restored'); }
      } catch (e) { svc.toast(`That file is not a valid Madhouse Standard backup${e.message === 'duplicate IDs' ? ' (duplicate repair IDs)' : ''}.`, 'warn'); }
      if (fileRef.current) fileRef.current.value = '';
    };
    fr.readAsText(file);
  };
  const danger = async (title, message, label, fn, done) => { if (await svc.confirm({ title, message, confirmLabel: label, danger: true })) { fn(); svc.toast(done); } };

  return (
    <div className="settings-grid">
      <div className="card">
        <h3>User and role</h3>
        <p className="small muted">Your name is recorded on library changes, assessments and validations. Only {AUTH_ROLES.join(', ')} can edit the library or override a classification.</p>
        <div className="form-grid one">
          <Field label="Name" required><input id="s-name" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} /></Field>
          <Field label="Role"><Select id="s-role" value={user.role} onChange={(r) => setUser({ ...user, role: r })} options={ROLES} /></Field>
          <button className="btn btn-primary" onClick={saveUser}>Save profile</button>
        </div>
        <p className="small muted">This prototype has no sign-in, so the role is self-declared. Enforce roles through authentication when the database moves to a server.</p>
      </div>

      <div className="card">
        <h3>Data storage</h3>
        <dl className="assume">
          <dt>Active store</dt><dd>{adapter.label}</dd>
          <dt>Status</dt><dd className={adapter.available ? 'ok-text' : 'warn-text'}>{adapter.available ? 'Available: data is kept in this browser on this device' : 'Unavailable: data lasts only for this session'}</dd>
          <dt>{firebaseAdapter.label}</dt><dd className="warn-text">Not connected</dd>
          <dt>Library items</dt><dd className="num">{app.library.length}</dd>
          <dt>Assessments</dt><dd className="num">{app.assessments.length}{samples ? ` (${samples} sample)` : ''}</dd>
        </dl>
        <p className="small">Records stay in this browser only. Other users and devices do not see them. Export a backup to move data or share it. The storage layer has a Firebase adapter slot with the same interface, ready to be wired to Firestore; it is not configured in this version.</p>
        <div className="row-actions">
          <button className="btn" onClick={backup}><Icon name="download" /> Export backup (JSON)</button>
          <label className="btn"><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files[0])} /> Restore backup…</label>
        </div>
      </div>

      <div className="card">
        <h3>Sample and reference data</h3>
        <p className="small muted">The eight sample assessments run engine scenarios A–G and are marked SAMPLE in every list and report.</p>
        <div className="stack-sm">
          {samples > 0 && <button className="btn" onClick={() => danger('Remove sample assessments?', `${samples} sample records will be deleted. Your own assessments are kept.`, 'Remove samples', app.clearSamples, 'Sample assessments removed')}>Remove sample assessments</button>}
          {samples === 0 && <button className="btn" onClick={() => { app.resetSamples(); svc.toast('Sample assessments restored'); }}>Restore sample assessments</button>}
          <button className="btn btn-danger-ghost" disabled={!app.authorized} onClick={() => danger('Reset the repair library?', 'All library edits and added items will be replaced by the standard 210-item library. Assessments are kept, but any that point to deleted custom items will lose their link.', 'Reset library', app.resetLibrary, 'Library reset to the Madhouse Standard')}>Reset library to standard</button>
        </div>
      </div>

      <div className="card sysinfo">
        <h3>System information</h3>
        <dl className="assume">
          <dt>System</dt><dd>MADHOUSE STANDARD Interior Fit-Out Defect &amp; Repair Classification System</dd>
          <dt>Version</dt><dd>1.0 (prototype)</dd>
          <dt>Sources</dt><dd>WARRANTY DATA MANAGEMENT SYSTEM: Copy of Warranty Repair Matrix; Common Repairs with Costing (Post-Con)</dd>
          <dt>Scope</dt><dd>Residential interior fit-out, Philippines</dd>
          <dt>Costing</dt><dd>Indicative budgetary references only</dd>
        </dl>
        <p className="wm-strong">Created by Ar. Stephen Catabijan / QQA</p>
      </div>
    </div>
  );
}
