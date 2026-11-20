const { useState, useMemo } = React;
import { useApp } from '../app.jsx';
import { ClassBadge, PrioBadge, Modal, Field, Select, Icon, peso, pesoRange, useSvc, toCSV, fmtDateTime, PRIORITY_LABEL, DISCLAIMER, cx, primaryTrade, Empty } from '../ui.jsx';
import { CATEGORIES, SUBCATEGORIES, QA_TEMPLATES } from '../data/profiles.js';
import { normName, consolidationLog } from '../store.js';
import { checklistFor } from '../qa.js';

export const FIELD_LABELS = {
  id: 'Unique Repair ID', category: 'Defect Category', subcategory: 'Subcategory', item: 'Repair Item', description: 'Defect Description',
  symptoms: 'Typical Symptoms', causes: 'Possible Root Causes', inspection: 'Inspection Requirements', method: 'Recommended Repair Method',
  minorCriteria: 'Minor Works Criteria', majorCriteria: 'Major Works Criteria', criticalCriteria: 'Critical Works Criteria',
  trade: 'Responsible Trade', laborCost: 'Estimated Labor Cost (PHP)', materialCost: 'Estimated Material Cost (PHP)',
  equipmentCost: 'Estimated Equipment/Logistics Cost (PHP)', costMin: 'Estimated Total Cost Minimum (PHP)', costMax: 'Estimated Total Cost Maximum (PHP)',
  duration: 'Estimated Repair Duration', priority: 'Default Priority', classification: 'Default Classification', qaVerification: 'Required QA Verification',
  warrantyNotes: 'Warranty Applicability Notes', qaTemplate: 'QA checklist template', catCode: 'Category code', sourceRef: 'Source reference', scaleToId: 'Major-scope counterpart',
};
export const CSV_FIELDS = ['id', 'category', 'subcategory', 'item', 'description', 'symptoms', 'causes', 'inspection', 'method', 'minorCriteria', 'majorCriteria',
  'criticalCriteria', 'trade', 'laborCost', 'materialCost', 'equipmentCost', 'costMin', 'costMax', 'duration', 'priority', 'qaVerification', 'warrantyNotes'];

export function libraryCSV(items) {
  return toCSV([...CSV_FIELDS.map((f) => FIELD_LABELS[f]), 'Default Classification', 'Source Reference', 'Merged CRC Entries', 'Created', 'Last Modified', 'Modified By'],
    items.map((it) => [...CSV_FIELDS.map((f) => it[f]), it.classification, it.sourceRef, (it.crcRefs || []).join(' '), it.createdAt, it.updatedAt, it.modifiedBy]));
}

const SORTS = [['id', 'ID'], ['item', 'Repair item A–Z'], ['costAsc', 'Cost: low to high'], ['costDesc', 'Cost: high to low'], ['prio', 'Priority']];

export function Library() {
  const app = useApp();
  const svc = useSvc();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cls, setCls] = useState('');
  const [prio, setPrio] = useState('');
  const [trade, setTrade] = useState('');
  const [sort, setSort] = useState('id');
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [showLog, setShowLog] = useState(false);

  const trades = useMemo(() => [...new Set(app.library.map((x) => primaryTrade(x.trade)))].sort(), [app.library]);
  const rows = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let r = app.library.filter((it) => {
      if (cat && it.catCode !== cat) return false;
      if (cls && it.classification !== cls) return false;
      if (prio && it.priority !== prio) return false;
      if (trade && primaryTrade(it.trade) !== trade) return false;
      if (!terms.length) return true;
      const hay = [it.id, it.item, it.subcategory, it.category, it.description, it.symptoms, it.causes, it.trade, it.sourceRef, ...(it.crcRefs || [])].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const mid = (x) => (Number(x.costMin) + Number(x.costMax)) / 2;
    const cmp = { id: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }), item: (a, b) => a.item.localeCompare(b.item),
      costAsc: (a, b) => mid(a) - mid(b), costDesc: (a, b) => mid(b) - mid(a), prio: (a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id) }[sort];
    return [...r].sort(cmp);
  }, [app.library, q, cat, cls, prio, trade, sort]);

  const requestDelete = async (it) => {
    const refs = app.assessments.filter((a) => a.itemId === it.id).length;
    if (refs) { svc.toast(`${it.id} is used by ${refs} assessment${refs > 1 ? 's' : ''}. Reassign or delete those first.`, 'warn'); return; }
    const ok = await svc.confirm({ title: 'Delete repair item?', message: `${it.id} "${it.item}" will be removed from the library. This cannot be undone unless you have a backup.`, confirmLabel: 'Delete item', danger: true });
    if (ok) { app.deleteItem(it.id); setView(null); svc.toast(`${it.id} deleted`); }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input id="lib-search" type="search" placeholder="Search ID, item, symptom, cause, trade…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search repair items" /></div>
        <div className="toolbar-right">
          <button className="btn" onClick={() => setShowLog(true)}>Source consolidation</button>
          <button className="btn" onClick={() => svc.exportFile(`madhouse-repair-library-${new Date().toISOString().slice(0, 10)}.csv`, libraryCSV(rows))}><Icon name="download" /> Export CSV</button>
          <button className="btn" onClick={() => app.go('reports', { type: 'matrix' })}>Print repair matrix</button>
          <button className="btn btn-primary" disabled={!app.authorized} title={app.authorized ? '' : 'Only QQA, Warranty Manager or Management can add items'} onClick={() => setEdit({ isNew: true })}><Icon name="plus" /> Add repair item</button>
        </div>
      </div>
      <div className="filters">
        <Select aria-label="Filter by category" value={cat} onChange={setCat} placeholder="All categories" options={Object.entries(CATEGORIES).map(([k, v]) => [k, `${k}. ${v}`])} />
        <Select aria-label="Filter by classification" value={cls} onChange={setCls} placeholder="All classifications" options={['Minor', 'Major', 'Critical']} />
        <Select aria-label="Filter by priority" value={prio} onChange={setPrio} placeholder="All priorities" options={Object.keys(PRIORITY_LABEL).map((p) => [p, `${p} ${PRIORITY_LABEL[p]}`])} />
        <Select aria-label="Filter by trade" value={trade} onChange={setTrade} placeholder="All trades" options={trades} />
        <Select aria-label="Sort" value={sort} onChange={setSort} options={SORTS} />
        <span className="count num">{rows.length} of {app.library.length} items</span>
      </div>
      {!app.authorized && <p className="note">Your role ({app.settings.user.role}) can view the library. Adding, editing and deleting items is limited to QQA, Warranty Manager and Management.</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>ID</th><th>Repair item</th><th>Classification</th><th>Priority</th><th>Trade</th><th className="r">Cost range (₱)</th><th>Duration</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className="clickable" onClick={() => setView(it.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setView(it.id); }}>
                <td className="mono nowrap">{it.id}</td>
                <td><b>{it.item}</b><div className="muted small">{it.catCode}. {it.subcategory}</div></td>
                <td><ClassBadge c={it.classification} small /></td>
                <td><PrioBadge p={it.priority} small /></td>
                <td className="small">{it.trade}</td>
                <td className="r num nowrap">{Number(it.costMin).toLocaleString()} – {Number(it.costMax).toLocaleString()}</td>
                <td className="nowrap small">{it.duration}</td>
                <td className="mono small nowrap">{it.sourceRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No repair items match">Clear the search or filters, or add a new item.</Empty>}
      </div>
      <p className="disclaimer">{DISCLAIMER}</p>

      {view && (() => { const it = app.library.find((x) => x.id === view); return it ? <ItemView it={it} onClose={() => setView(null)} onEdit={() => { setEdit({ id: it.id }); setView(null); }} onDelete={() => requestDelete(it)} /> : null; })()}
      {edit && <ItemForm init={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setView(id); }} />}
      {showLog && <ConsolidationLog onClose={() => setShowLog(false)} />}
    </div>
  );
}

function Section({ label, children }) {
  return <div className="kv"><span>{label}</span><div>{children || <span className="muted">—</span>}</div></div>;
}

export function ItemView({ it, onClose, onEdit, onDelete }) {
  const app = useApp();
  const cl = checklistFor(it);
  const counterpart = it.scaleToId && app.library.find((x) => x.id === it.scaleToId);
  return (
    <Modal title={`${it.id} · ${it.item}`} onClose={onClose} xwide
      footer={<>
        {app.authorized && <button className="btn btn-danger-ghost" onClick={onDelete}><Icon name="trash" /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => { onClose(); app.go('cost', { itemId: it.id }); }}>Estimate cost</button>
        <button className="btn" onClick={() => { onClose(); app.go('assess', { itemId: it.id }); }}>Assess a defect</button>
        {app.authorized && <button className="btn btn-primary" onClick={onEdit}><Icon name="edit" /> Edit</button>}
      </>}>
      <div className="view-head">
        <ClassBadge c={it.classification} /><PrioBadge p={it.priority} />
        <span className="chip">{it.catCode}. {it.category}</span><span className="chip">{it.subcategory}</span>
        <span className="chip mono">{it.sourceRef}{(it.crcRefs || []).length ? ' + ' + it.crcRefs.join(', ') : ''}</span>
      </div>
      <div className="view-grid">
        <div>
          <Section label={FIELD_LABELS.description}>{it.description}</Section>
          <Section label={FIELD_LABELS.symptoms}>{it.symptoms}</Section>
          <Section label={FIELD_LABELS.causes}>{it.causes}</Section>
          <Section label={FIELD_LABELS.inspection}>{it.inspection}</Section>
          <Section label={FIELD_LABELS.method}>{it.method}</Section>
          <div className="criteria">
            <div className="crit crit-minor"><b>Minor Works criteria</b><p>{it.minorCriteria}</p></div>
            <div className="crit crit-major"><b>Major Works criteria</b><p>{it.majorCriteria}</p></div>
            <div className="crit crit-critical"><b>Critical Works criteria</b><p>{it.criticalCriteria}</p></div>
          </div>
          <Section label={FIELD_LABELS.warrantyNotes}>{it.warrantyNotes}</Section>
        </div>
        <div>
          <div className="cost-box">
            <div className="cost-total"><span>Indicative total</span><b className="num">{pesoRange(it.costMin, it.costMax)}</b></div>
            <dl className="cost-split">
              <dt>Labor</dt><dd className="num">{peso(it.laborCost)}</dd>
              <dt>Materials</dt><dd className="num">{peso(it.materialCost)}</dd>
              <dt>Equipment / logistics</dt><dd className="num">{peso(it.equipmentCost)}</dd>
            </dl>
            <p className="small muted">Split shown at mid-range. Indicative only; subject to site validation and contractor quotation.</p>
          </div>
          <Section label={FIELD_LABELS.trade}>{it.trade}</Section>
          <Section label={FIELD_LABELS.duration}>{it.duration}</Section>
          {counterpart && <Section label="If assessed as Major">{counterpart.id} · {counterpart.item}</Section>}
          <div className="kv"><span>{FIELD_LABELS.qaVerification} ({cl.label})</span>
            <ul className="checklist">{cl.list.map((c) => <li key={c.key}>{c.label}{c.mandatory && <em className="mand">mandatory</em>}</li>)}</ul>
          </div>
          <div className="kv"><span>Record history</span>
            <div className="small"><div>Created {fmtDateTime(it.createdAt)}</div><div>Last modified {fmtDateTime(it.updatedAt)} by {it.modifiedBy || '—'}</div></div>
            <ul className="history">
              {[...(it.history || [])].reverse().map((h, i) => (
                <li key={i}><b>{h.action}</b> · {fmtDateTime(h.at)} · {h.by}
                  {h.changes && <table className="tbl tbl-mini"><thead><tr><th>Field</th><th>Previous value</th><th>Updated value</th></tr></thead>
                    <tbody>{h.changes.map((c, j) => <tr key={j}><td>{FIELD_LABELS[c.field] || c.field}</td><td>{String(c.from)}</td><td>{String(c.to)}</td></tr>)}</tbody></table>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function nextId(library, cat) {
  const nums = library.filter((x) => x.id.startsWith(`MS-${cat}-`)).map((x) => parseInt(x.id.split('-')[2], 10)).filter((n) => !Number.isNaN(n));
  return `MS-${cat}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function ItemForm({ init, onClose, onSaved }) {
  const app = useApp();
  const svc = useSvc();
  const existing = init.id ? app.library.find((x) => x.id === init.id) : null;
  const [v, setV] = useState(() => existing ? { ...existing } : {
    id: nextId(app.library, 'A'), catCode: 'A', category: CATEGORIES.A, subcategory: '', item: '', description: '', symptoms: '', causes: '', inspection: '',
    method: '', minorCriteria: '', majorCriteria: '', criticalCriteria: '', trade: '', laborCost: '', materialCost: '', equipmentCost: '',
    costMin: '', costMax: '', duration: '', priority: 'P3', classification: 'Minor', qaTemplate: 'carpentry', qaVerification: '', warrantyNotes: 'Warranty period per contract and Certificate of Completion terms. Coverage subject to validation: excludes owner misuse, alterations by others, normal wear and tear, and damage from external events.', sourceRef: 'MS-USER',
  });
  const [errors, setErrors] = useState({});
  const [dupOk, setDupOk] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e && e.target ? e.target.value : e }));
  const subs = Object.entries(SUBCATEGORIES).filter(([, s]) => s.cat === v.catCode);

  const setCat = (c) => setV((s) => ({ ...s, catCode: c, category: CATEGORIES[c], id: existing ? s.id : nextId(app.library, c) }));
  const pickSub = (name) => {
    const ent = subs.find(([, s]) => s.name === name);
    setV((s) => {
      const n = { ...s, subcategory: name };
      if (ent) {
        const p = ent[1];
        if (!s.symptoms) n.symptoms = p.symptoms; if (!s.inspection) n.inspection = p.inspect;
        if (!s.minorCriteria) n.minorCriteria = p.minor; if (!s.majorCriteria) n.majorCriteria = p.major; if (!s.criticalCriteria) n.criticalCriteria = p.critical;
        n.qaTemplate = p.qa;
      }
      return n;
    });
  };

  const dups = useMemo(() => {
    const nn = normName(v.item);
    if (!nn) return [];
    return app.library.filter((x) => x.id !== (existing && existing.id) && (normName(x.item) === nn || (nn.length > 12 && (normName(x.item).includes(nn) || nn.includes(normName(x.item))))));
  }, [v.item, app.library]);

  const validate = () => {
    const e = {};
    const req = ['id', 'subcategory', 'item', 'description', 'method', 'trade', 'duration', 'costMin', 'costMax'];
    req.forEach((k) => { if (!String(v[k] ?? '').trim()) e[k] = 'Required'; });
    if (v.id && !/^[A-Z0-9][A-Z0-9-]{2,24}$/.test(v.id)) e.id = 'Use capital letters, numbers and hyphens, e.g. MS-A-034';
    if (!existing && app.library.some((x) => x.id === v.id)) e.id = `${v.id} already exists. Each repair ID must be unique.`;
    ['laborCost', 'materialCost', 'equipmentCost', 'costMin', 'costMax'].forEach((k) => {
      if (v[k] !== '' && v[k] != null && (Number.isNaN(Number(v[k])) || Number(v[k]) < 0)) e[k] = 'Enter a positive number';
    });
    if (!e.costMin && !e.costMax && Number(v.costMin) > Number(v.costMax)) e.costMax = 'Maximum must be equal to or greater than the minimum';
    if (!e.costMin && v.costMin !== '' && Number(v.costMin) === 0) e.costMin = 'Minimum must be above zero';
    if (dups.length && !dupOk) e.dup = 'Confirm this is a separate item, or edit the existing one instead.';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const save = () => {
    if (!validate()) { svc.toast('Check the highlighted fields', 'warn'); return; }
    const num = (x) => (x === '' || x == null ? 0 : Number(x));
    const item = { ...v, laborCost: num(v.laborCost), materialCost: num(v.materialCost), equipmentCost: num(v.equipmentCost), costMin: num(v.costMin), costMax: num(v.costMax) };
    app.saveItem(item, existing ? existing.id : null);
    svc.toast(existing ? `${item.id} updated` : `${item.id} added`);
    onSaved(item.id);
  };
  const splitSum = ['laborCost', 'materialCost', 'equipmentCost'].reduce((a, k) => a + (Number(v[k]) || 0), 0);
  const T = (k, rows = 2, span = 2) => <Field label={FIELD_LABELS[k]} error={errors[k]} span={span} required={['description', 'method'].includes(k)}><textarea id={'f-' + k} rows={rows} value={v[k]} onChange={set(k)} /></Field>;
  const N = (k, req) => <Field label={FIELD_LABELS[k]} error={errors[k]} required={req}><input id={'f-' + k} inputMode="numeric" value={v[k]} onChange={set(k)} /></Field>;

  return (
    <Modal title={existing ? `Edit ${existing.id}` : 'Add repair item'} onClose={onClose} xwide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{existing ? 'Save changes' : 'Add to library'}</button></>}>
      <div className="form-grid">
        <Field label={FIELD_LABELS.id} required error={errors.id} hint={existing ? 'IDs cannot change once created (assessments reference them).' : 'Suggested next ID for the category.'}>
          <input id="f-id" className="mono" value={v.id} readOnly={!!existing} onChange={(e) => setV((s) => ({ ...s, id: e.target.value.toUpperCase() }))} />
        </Field>
        <Field label={FIELD_LABELS.category} required><Select id="f-cat" value={v.catCode} onChange={setCat} options={Object.entries(CATEGORIES).map(([k, n]) => [k, `${k}. ${n}`])} /></Field>
        <Field label={FIELD_LABELS.subcategory} required error={errors.subcategory} hint="Pick a standard subcategory to prefill its criteria, or type a new one.">
          <input id="f-sub" list="sub-list" value={v.subcategory} onChange={(e) => pickSub(e.target.value)} />
          <datalist id="sub-list">{subs.map(([k, s]) => <option key={k} value={s.name} />)}</datalist>
        </Field>
        <Field label={FIELD_LABELS.item} required error={errors.item} span={2}><input id="f-item" value={v.item} onChange={set('item')} /></Field>
        <Field label={FIELD_LABELS.trade} required error={errors.trade}>
          <input id="f-trade" list="trade-list" value={v.trade} onChange={set('trade')} />
          <datalist id="trade-list">{[...new Set(app.library.map((x) => x.trade))].sort().map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        {dups.length > 0 && (
          <div className="dup-warn span-3">
            <Icon name="alert" /><div><b>Possible duplicate.</b> Similar items already exist: {dups.slice(0, 4).map((d) => `${d.id} "${d.item}"`).join('; ')}.
              <label className="check"><input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} /> This is a separate repair item</label>
              {errors.dup && <span className="field-error">{errors.dup}</span>}</div>
          </div>
        )}
        <Field label={FIELD_LABELS.classification} required><Select id="f-cls" value={v.classification} onChange={set('classification')} options={['Minor', 'Major', 'Critical']} /></Field>
        <Field label={FIELD_LABELS.priority} required><Select id="f-prio" value={v.priority} onChange={set('priority')} options={Object.keys(PRIORITY_LABEL).map((p) => [p, `${p} ${PRIORITY_LABEL[p]}`])} /></Field>
        <Field label={FIELD_LABELS.duration} required error={errors.duration} hint="e.g. 2–4 hrs, 1 day, 2–3 days"><input id="f-dur" value={v.duration} onChange={set('duration')} /></Field>
        {T('description')}{T('symptoms', 2, 1)}
        {T('causes', 2, 1)}{T('inspection', 2, 2)}
        {T('method', 3, 3)}
        {T('minorCriteria', 3, 1)}{T('majorCriteria', 3, 1)}{T('criticalCriteria', 3, 1)}
        {N('costMin', true)}{N('costMax', true)}
        <div className="field"><span className="field-label">Mid-range split check</span><span className="num">{peso(splitSum)} of {peso(((Number(v.costMin) || 0) + (Number(v.costMax) || 0)) / 2)} mid-range</span></div>
        {N('laborCost')}{N('materialCost')}{N('equipmentCost')}
        <Field label={FIELD_LABELS.qaTemplate}><Select id="f-qat" value={v.qaTemplate} onChange={set('qaTemplate')} options={Object.entries(QA_TEMPLATES).map(([k, t]) => [k, t.label])} /></Field>
        {T('qaVerification', 2, 2)}
        {T('warrantyNotes', 2, 3)}
      </div>
    </Modal>
  );
}

function ConsolidationLog({ onClose }) {
  const log = useMemo(() => consolidationLog(), []);
  const [type, setType] = useState('');
  const types = [...new Set(log.map((l) => l.type))];
  const rows = log.filter((l) => !type || l.type === type);
  const svc = useSvc();
  return (
    <Modal title="Source consolidation register" onClose={onClose} xwide
      footer={<><button className="btn" onClick={() => svc.exportFile('madhouse-source-consolidation.csv', toCSV(['Change type', 'Source reference', 'Library ID', 'Note'], log.map((l) => [l.type, l.ref, l.id, l.note])))}><Icon name="download" /> Export CSV</button><button className="btn btn-primary" onClick={onClose}>Close</button></>}>
      <p className="small">Sources: <b>Copy of Warranty Repair Matrix</b> (50 items, WRM-01 to WRM-50) and <b>COMMON REPAIRS WITH COSTING (POST-CON)</b> (17 Minor and 15 Major entries, CRC). All 50 matrix items are preserved under their source names. All 32 CRC entries matched a matrix item and were merged into it. No source record was deleted or renamed. Items marked MS-NEW are Madhouse Standard additions.</p>
      <div className="filters">
        <Select aria-label="Change type" value={type} onChange={setType} placeholder={`All changes (${log.length})`} options={types.map((t) => [t, `${t} (${log.filter((l) => l.type === t).length})`])} />
      </div>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Change</th><th>Source</th><th>Library ID</th><th>Note</th></tr></thead>
        <tbody>{rows.map((l, i) => <tr key={i}><td className="nowrap"><span className={cx('chip', l.type === 'Preserved' ? '' : 'chip-hi')}>{l.type}</span></td><td className="mono nowrap">{l.ref}</td><td className="mono nowrap">{l.id}</td><td className="small">{l.note}</td></tr>)}</tbody></table></div>
    </Modal>
  );
}
