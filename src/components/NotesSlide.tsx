/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SystemSettings } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { calculateScheduleElapsed } from '../utils/calculations.ts';

export const NotesSlide: React.FC<{ settings: SystemSettings }> = ({ settings }) => {
  const elapsed = calculateScheduleElapsed();

  const notes = [
    {
      title: 'Planned work stoppage',
      content:
        'Work stops after Dec 19, 2026 and resumes Jan 4, 2027. The 7 Monday–Saturday working days in between (Dec 21, 22, 23, 26, 28, 29 and Jan 2, excluding listed holidays) are removed, so every activity after Dec 19 moves by 7 working days. Working-day durations and sequence are unchanged; activities in progress across the break continue on Jan 4.',
    },
    {
      title: 'Testing & commissioning (proposed)',
      content:
        'Proposed: 1 working day on every floor, with the removed days reassigned to other finishing scopes (see the floor pages). Not yet in the baseline schedule; requires site-team approval.',
    },
    {
      title: 'Work calendar',
      content:
        'Monday–Saturday work; Sundays excluded. Holidays listed in the holiday calendar are excluded from working-day duration calculations.',
    },
    {
      title: '2026 holiday source',
      content:
        'Proclamation No. 1006 declares Nov 2, Nov 30, Dec 8, Dec 24, Dec 25, Dec 30 and Dec 31 as non-working/regular holidays relevant to this period.',
    },
    {
      title: 'NCR-specific shutdown',
      content:
        'Proclamation No. 1449 declares Nov 16–18, 2026 as special non-working days in the National Capital Region; included because the project is in NCR.',
    },
    {
      title: '2027 holiday source',
      content:
        'Proclamation No. 1427 declares Jan 1, Feb 6, Mar 25–27, and Apr 9, 2027 as non-working/regular holidays relevant to this schedule. Feb 25 is a special working day and is not excluded.',
    },
    {
      title: 'Second Floor controlling milestone',
      content:
        'Structural sequence follows the stated methodology: one-sitting Ground-to-Second Floor column/post installation; I-beam connections; steel deck; MEP embedded works; concrete/slab preparation; curing/structural preparation; inspection target Nov 28, 2026. The sequence is highly compressed and must be validated by the structural engineer, especially concrete curing, load transfer, inspection hold points, and safe access. Stair framing is separated to January 2027.',
    },
    {
      title: 'Third Floor structural inputs',
      content:
        'Dates retained for columns/posts Nov 28–Dec 3; I-beam connections Dec 1–5; MEP embedded works Dec 11–14; concrete Dec 15; interim inspection Dec 16. Steel deck/reinforcement extended to Dec 14 to avoid Dec 8 holiday.',
    },
    {
      title: 'Dependency check',
      content:
        'Ground Floor columns/structural works precede the shared column/post installation to Second Floor. Structural steps follow the project’s stated order. Stair/structural framing is separated to after the Jan 4 restart: GF Jan 13–20, 2027; 2F Jan 21–27, 2027; 3F Jan 27–Feb 2, 2027. Jan 27 overlaps between 2F and 3F and needs workface/safety coordination. Ground Floor slab pour remains Dec 18 and inspection/completion Dec 19.',
    },
    {
      title: 'Overall completion risk',
      content:
        'The original Apr 8, 2027 overall construction target is superseded by the updated end-of-project dates: punchlist Apr 7, rectification Apr 8–24, interior styling Apr 26–27, move-in Apr 28–29 and turnover ceremony Apr 30, 2027. Review them against all floor finishing, punchlist, inspection and turnover dependencies. Ground Floor punchlist / rectification (Apr 13–14) falls inside the rectification period.',
    },
    {
      title: 'Limitations',
      content:
        'Calendar dates and durations do not validate engineering adequacy. The single-sitting column/post installation and compressed structural sequence must be confirmed against approved structural drawings, lifting/temporary bracing plans, connection inspection, concrete curing/strength requirements, load limits, MEP coordination, manpower, access, and safety plans. Do not load or inspect as complete until the responsible structural engineer approves.',
    },
  ];

  return (
    <section className="wrap">
      <div
        className="slide"
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '1920px',
          height: '1280px',
          boxSizing: 'border-box',
          background:
            'var(--sx-bg-25)',
          color: 'var(--sx-text-26)',
          fontFamily: "'Barlow', sans-serif",
          padding: '48px 56px 130px',
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
        }}
      >
        <div className="stl" />
        <div className="str" />

        {/* Header */}
        <div className="hdr" style={{ display: 'flex', alignItems: 'center', gap: '30px', height: '150px', flex: 'none' }}>
          <BrandLogo variant="slide" />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Schedule
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
              Notes
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: 'var(--sx-text-3)' }}>
                    SCHEDULE ELAPSED
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: 'var(--sx-text-3)' }}>
                    {elapsed.elapsedPercent}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'var(--sx-bg-35)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(elapsed.elapsedPercent, 2)}%`, borderRadius: '5px', background: 'var(--sx-bg-37)' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                  Working days: {elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} elapsed
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', gap: '10px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <span style={{ background: '#E0213B', color: '#fff', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', padding: '2px 10px', borderRadius: '4px' }}>
                  WORK STOPPAGE
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>
                  Stops after Dec 19 · resumes Jan 4, 2027
                </span>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: 'var(--sx-text-2)', textTransform: 'uppercase' }}>
              Schedule notes
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
              12
            </span>
            <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Notes Table */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
              <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>NOTES &amp;</span>
                <span style={{ color: 'var(--sx-text-3)' }}>VALIDATION ITEMS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {notes.map((n, idx) => (
                <div
                  key={idx}
                  className="nrow"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    padding: '6px 16px',
                    borderBottom: 'var(--sx-border-31)',
                    background: idx % 2 === 0 ? 'var(--sx-bg-39)' : 'transparent',
                  }}
                >
                  <div style={{ width: '260px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '21px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase', lineHeight: '23px' }}>
                    {n.title}
                  </div>
                  <div style={{ flex: 1, fontSize: '15px', lineHeight: '21px' }}>
                    {n.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ftr" style={{ position: 'absolute', left: '340px', right: '340px', bottom: '40px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', width: '100%' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
            <div className="wm" style={{ fontSize: '22px', letterSpacing: '9px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Convengers Bahay Build
            </div>
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sx-text-3)', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
