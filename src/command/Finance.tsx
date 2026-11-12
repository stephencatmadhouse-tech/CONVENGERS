/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BUDGET & EXPENSE MONITORING — System Administrator / Project Manager only.
 * The collections are readable only by those roles (firestore.rules), and
 * other roles never subscribe to them. Figures are entered by the team; no
 * amounts are estimated.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { BudgetLine, Expense } from '../types/index.ts';
import { budgetStore, expenseStore, procurementStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { newId } from '../firebase/collectionStore.ts';
import { firestoreData } from '../firebase/firestoreData.ts';
import { fmtDate, isValidIso } from '../domain/dates.ts';
import { toCsv } from '../domain/reports.ts';
import { Banner, Card, Empty, Field, Kpi, Modal, ProgressBar, downloadFile } from './ui.tsx';

const peso = (n: number | undefined | null) =>
  n === undefined || n === null || isNaN(n) ? '—' : `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Finance: React.FC = () => {
  const { isManager } = useCommand();
  if (!isManager) {
    return (
      <Banner kind="info">
        Budget and expense information is restricted to the System Administrator and Project Managers. It is not loaded for your role.
      </Banner>
    );
  }
  return <FinanceInner />;
};

const FinanceInner: React.FC = () => {
  const { actions, user, isAdmin, today } = useCommand();
  const budget = useStore(budgetStore);
  const expenses = useStore(expenseStore);
  const procurement = useStore(procurementStore);
  const [editLine, setEditLine] = useState<BudgetLine | null>(null);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [lineFilter, setLineFilter] = useState('');

  const lines = budget.items.filter((b) => !b.archived);
  const exps = expenses.items.filter((e) => !e.archived);
  const spentBy = useMemo(() => {
    const m = new Map<string, number>();
    exps.forEach((e) => m.set(e.budgetLineId || '__none', (m.get(e.budgetLineId || '__none') || 0) + (Number(e.amount) || 0)));
    return m;
  }, [exps]);
  const totalBudget = lines.reduce((s, b) => s + (Number(b.budget) || 0), 0);
  const totalAllocated = lines.reduce((s, b) => s + (Number(b.allocated) || 0), 0);
  const totalSpent = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const unassigned = spentBy.get('__none') || 0;
  const over = lines.filter((b) => (spentBy.get(b.id) || 0) > (Number(b.budget) || 0));

  const shownExp = exps.filter((e) => !lineFilter || (lineFilter === '__none' ? !e.budgetLineId : e.budgetLineId === lineFilter));

  const exportCsv = () => {
    const a = toCsv(
      ['Budget line', 'Category', 'Budget', 'Allocated', 'Actual expenses', 'Remaining', 'Variance (budget − actual)'],
      lines.map((b) => {
        const spent = spentBy.get(b.id) || 0;
        return [b.id, b.category, b.budget, b.allocated ?? '', spent, (b.budget || 0) - spent, (b.budget || 0) - spent];
      })
    );
    const e = toCsv(
      ['Expense', 'Date', 'Budget line', 'Description', 'Vendor', 'Reference', 'Amount'],
      exps.map((x) => [x.id, x.date, lines.find((l) => l.id === x.budgetLineId)?.category || '', x.description, x.vendor, x.reference, x.amount])
    );
    downloadFile(`Convengers_Budget_${today}.csv`, `${a}\r\n\r\n${e}`, 'text/csv;charset=utf-8');
  };

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <Banner kind="info">Restricted financial information — visible only to the System Administrator and Project Managers.</Banner>
      {(!budget.shared || !expenses.shared) && budget.loaded && (
        <Banner kind="warn">Shared finance storage is not available yet (deploy the updated Firestore rules). New records are kept on this device only.</Banner>
      )}
      <div className="cv-kpis">
        <Kpi label="Project budget" value={lines.length ? peso(totalBudget) : 'Not yet provided'} />
        <Kpi label="Allocated / committed" value={lines.length ? peso(totalAllocated) : '—'} />
        <Kpi label="Actual expenses" value={peso(totalSpent)} color="#7026C8" />
        <Kpi label="Remaining balance" value={lines.length ? peso(totalBudget - totalSpent) : '—'} color={totalBudget - totalSpent < 0 ? '#E5484D' : undefined} />
        <Kpi label="Lines over budget" value={over.length} color={over.length ? '#E5484D' : undefined} sub={unassigned ? `${peso(unassigned)} not assigned to a line` : undefined} />
      </div>
      <Card
        title="Budget lines"
        note="Budget vs actual by category"
        actions={
          <>
            <button type="button" className="cv-btn sm" onClick={exportCsv}>
              ⬇ CSV
            </button>
            <button
              type="button"
              className="cv-btn primary sm"
              onClick={() => setEditLine({ id: newId('BUD'), category: '', budget: 0, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' })}
            >
              + Add budget line
            </button>
          </>
        }
      >
        {lines.length ? (
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Budget</th>
                  <th className="num">Allocated</th>
                  <th className="num">Actual</th>
                  <th className="num">Remaining</th>
                  <th style={{ minWidth: 140 }}>Used</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((b) => {
                  const spent = spentBy.get(b.id) || 0;
                  const rem = (b.budget || 0) - spent;
                  const usedPct = b.budget ? (spent / b.budget) * 100 : 0;
                  return (
                    <tr key={b.id} className="clickable" onClick={() => setEditLine(b)}>
                      <td>
                        <div className="cv-strong">{b.category}</div>
                        {b.description && <div className="cv-dim">{b.description}</div>}
                      </td>
                      <td className="num">{peso(b.budget)}</td>
                      <td className="num">{b.allocated !== undefined ? peso(b.allocated) : '—'}</td>
                      <td className="num">{peso(spent)}</td>
                      <td className={`num ${rem < 0 ? 'cv-late' : ''}`}>{peso(rem)}</td>
                      <td>
                        <ProgressBar actual={Math.min(100, usedPct)} color={usedPct > 100 ? '#E5484D' : undefined} />
                        <div className="cv-dim">{usedPct.toFixed(0)}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>The project budget has not been provided yet. Add budget lines (e.g. structural works, finishing, MEP) to start tracking.</Empty>
        )}
      </Card>
      <Card
        title="Expenses"
        note={`${shownExp.length} record(s)`}
        actions={
          <>
            <select className="cv-select" value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} aria-label="Budget line filter">
              <option value="">All budget lines</option>
              <option value="__none">Not assigned</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.category}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cv-btn primary sm"
              onClick={() => setEditExp({ id: newId('EXP'), date: today, description: '', amount: 0, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' })}
            >
              + Record expense
            </button>
          </>
        }
      >
        {shownExp.length ? (
          <div className="cv-table-wrap" style={{ maxHeight: 420 }}>
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Budget line</th>
                  <th>Vendor</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shownExp.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => setEditExp(e)}>
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td className="cv-strong">
                      {e.description}
                      {e.localOnly ? <span className="cv-dim"> · this device only</span> : null}
                    </td>
                    <td>{lines.find((l) => l.id === e.budgetLineId)?.category || <span className="cv-dim">Not assigned</span>}</td>
                    <td>{e.vendor || '—'}</td>
                    <td className="cv-dim">{e.reference || '—'}</td>
                    <td className="num">{peso(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No expenses recorded.</Empty>
        )}
      </Card>
      {editLine && (
        <LineEditor
          line={editLine}
          canDelete={isAdmin}
          onClose={() => setEditLine(null)}
          onSave={async (l, isNew) => {
            const res = await budgetStore.put(l);
            await firestoreData.logAudit(user, isNew ? 'ADD_BUDGET_LINE' : 'UPDATE_BUDGET_LINE', 'Budget', l.id, `${l.category} ${l.budget}`);
            actions.toast(res === 'shared' ? 'Budget line saved' : 'Saved on this device only');
          }}
          onDelete={async (id) => {
            await budgetStore.remove(id);
            await firestoreData.logAudit(user, 'DELETE_BUDGET_LINE', 'Budget', id);
          }}
        />
      )}
      {editExp && (
        <ExpenseEditor
          exp={editExp}
          lines={lines}
          procurement={procurement.items}
          canDelete={isAdmin}
          onClose={() => setEditExp(null)}
          onSave={async (x, isNew) => {
            const res = await expenseStore.put(x);
            await firestoreData.logAudit(user, isNew ? 'ADD_EXPENSE' : 'UPDATE_EXPENSE', 'Expense', x.id, `${x.description} ${x.amount}`);
            actions.toast(res === 'shared' ? 'Expense saved' : 'Saved on this device only');
          }}
          onDelete={async (id) => {
            await expenseStore.remove(id);
            await firestoreData.logAudit(user, 'DELETE_EXPENSE', 'Expense', id);
          }}
        />
      )}
    </div>
  );
};

const LineEditor: React.FC<{ line: BudgetLine; canDelete: boolean; onClose: () => void; onSave: (l: BudgetLine, isNew: boolean) => Promise<void>; onDelete: (id: string) => Promise<void> }> = ({
  line,
  canDelete,
  onClose,
  onSave,
  onDelete,
}) => {
  const { user } = useCommand();
  const [f, setF] = useState(line);
  const isNew = !line.createdAt;
  const valid = f.category.trim() && !isNaN(f.budget) && f.budget >= 0;
  return (
    <Modal
      title={isNew ? 'Add budget line' : f.category}
      sub={f.id}
      onClose={onClose}
      width={560}
      footer={
        <>
          {canDelete && !isNew && (
            <button
              type="button"
              className="cv-btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await onDelete(f.id);
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn primary"
            disabled={!valid}
            onClick={async () => {
              const now = new Date().toISOString();
              await onSave({ ...f, category: f.category.trim(), createdAt: f.createdAt || now, createdBy: f.createdBy || user.name, updatedAt: now, updatedBy: user.name }, isNew);
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="cv-fieldset">
        <Field label="Category" className="full">
          <input className="cv-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        </Field>
        <Field label="Description" className="full">
          <input className="cv-input" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Approved budget (₱)">
          <input type="number" min={0} className="cv-input" value={f.budget} onChange={(e) => setF({ ...f, budget: Number(e.target.value) })} />
        </Field>
        <Field label="Allocated / committed (₱)">
          <input type="number" min={0} className="cv-input" value={f.allocated ?? ''} onChange={(e) => setF({ ...f, allocated: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Field>
        <Field label="Notes" className="full">
          <textarea className="cv-textarea" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

const ExpenseEditor: React.FC<{
  exp: Expense;
  lines: BudgetLine[];
  procurement: { id: string; material: string }[];
  canDelete: boolean;
  onClose: () => void;
  onSave: (x: Expense, isNew: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ exp, lines, procurement, canDelete, onClose, onSave, onDelete }) => {
  const { user, today } = useCommand();
  const [f, setF] = useState(exp);
  const isNew = !exp.createdAt;
  const errors: string[] = [];
  if (!f.description.trim()) errors.push('Description is required.');
  if (isNaN(f.amount) || f.amount <= 0) errors.push('Amount must be greater than zero.');
  if (!isValidIso(f.date)) errors.push('Date is required.');
  if (f.date > today) errors.push('Expense date cannot be in the future.');
  return (
    <Modal
      title={isNew ? 'Record expense' : f.description}
      sub={f.id}
      onClose={onClose}
      width={620}
      footer={
        <>
          {canDelete && !isNew && (
            <button
              type="button"
              className="cv-btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await onDelete(f.id);
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn primary"
            disabled={errors.length > 0}
            onClick={async () => {
              const now = new Date().toISOString();
              await onSave({ ...f, description: f.description.trim(), createdAt: f.createdAt || now, createdBy: f.createdBy || user.name, updatedAt: now, updatedBy: user.name }, isNew);
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {errors.length > 0 && f.description && <Banner kind="error">{errors.join(' ')}</Banner>}
      <div className="cv-fieldset">
        <Field label="Description" className="full">
          <input className="cv-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" className="cv-input" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Amount (₱)">
          <input type="number" min={0} step="0.01" className="cv-input" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
        </Field>
        <Field label="Budget line">
          <select className="cv-select" value={f.budgetLineId || ''} onChange={(e) => setF({ ...f, budgetLineId: e.target.value || undefined })}>
            <option value="">— not assigned —</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked procurement">
          <select className="cv-select" value={f.linkedProcurementId || ''} onChange={(e) => setF({ ...f, linkedProcurementId: e.target.value || undefined })}>
            <option value="">— none —</option>
            {procurement.map((p) => (
              <option key={p.id} value={p.id}>
                {p.material}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor">
          <input className="cv-input" value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
        </Field>
        <Field label="OR / invoice no.">
          <input className="cv-input" value={f.reference || ''} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
