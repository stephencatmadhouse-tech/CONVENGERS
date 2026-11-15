/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared client-portal building blocks (status pills, bars, empty states, photo grid).
 */

import React, { useState } from 'react';
import type { PortalRecord } from '../domain/portal.ts';
import { fmtDate } from '../domain/dates.ts';

export const ITEM_STATUS: Record<string, string> = {
  Completed: '#22A06B',
  'In progress': '#7026C8',
  'In Progress': '#7026C8',
  Upcoming: '#6B6E80',
  'Schedule Update Required': '#D97706',
  'Behind schedule': '#E5484D',
  Scheduled: '#777777',
  'On hold': '#777777',
  Target: '#777777',
  Confirmed: '#22A06B',
  Tentative: '#F5A623',
  'At risk': '#E5484D',
};


export const Pill: React.FC<{ label: string }> = ({ label }) => {
  const c = ITEM_STATUS[label] || '#777777';
  return (
    <span className="pt-pill" style={{ color: c, borderColor: c }}>
      {label}
    </span>
  );
};

export const Bar: React.FC<{ value: number; planned?: number }> = ({ value, planned }) => (
  <div className="pt-bar" title={`Actual ${Math.round(value)}%${planned !== undefined ? ` · planned ${Math.round(planned)}%` : ''}`}>
    <b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    {planned !== undefined && <i style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }} />}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="pt-empty">{children}</div>;


export const PhotoGrid: React.FC<{ photos: PortalRecord[] }> = ({ photos }) => {
  const [open, setOpen] = useState<PortalRecord | null>(null);
  return (
    <>
      <div className="pt-gallery">
        {photos.map((p) => (
          <button key={p.id} type="button" className="pt-photo" onClick={() => setOpen(p)}>
            <img src={p.content.url} alt={p.title} loading="lazy" />
            <div>
              <b>{p.title}</b>
              <div className="pt-small" style={{ margin: 0 }}>
                {fmtDate(p.content.date)}
                {p.content.category ? ` · ${p.content.category}` : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
      {open && (
        <div className="pt-lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={open.content.url} alt={open.title} />
          <div>
            <b>{open.title}</b> · {fmtDate(open.content.date)}
          </div>
          {open.content.caption && <div style={{ maxWidth: 700, textAlign: 'center' }}>{open.content.caption}</div>}
        </div>
      )}
    </>
  );
};

