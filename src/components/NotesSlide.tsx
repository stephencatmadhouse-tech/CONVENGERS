/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SystemSettings } from '../types/index.ts';
import { LOGO_SVG } from '../constants/assets.ts';
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
            'radial-gradient(900px 520px at 92% 0%,rgba(123,77,255,.42),transparent 65%),radial-gradient(800px 600px at 0% 45%,rgba(60,40,190,.30),transparent 65%),radial-gradient(900px 600px at 100% 80%,rgba(90,50,220,.24),transparent 65%),repeating-linear-gradient(135deg,rgba(255,255,255,.025) 0 2px,transparent 2px 16px),#060A24',
          color: '#FFFFFF',
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
          <img
            className="logo"
            src={LOGO_SVG}
            alt="Logo"
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', objectFit: 'contain', borderRadius: '12px', filter: 'drop-shadow(0 0 16px rgba(123,77,255,0.65))' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Schedule
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Notes
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: '#F5C518' }}>
                    SCHEDULE ELAPSED
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: '#F5C518' }}>
                    {elapsed.elapsedPercent}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,.14)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(elapsed.elapsedPercent, 2)}%`, borderRadius: '5px', background: 'linear-gradient(90deg,#F5C518,#FF9A1F)' }} />
                </div>
                <div style={{ fontSize: '12px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                  Working days: {elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} elapsed
                </div>
              </div>
            </div>

            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
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
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Schedule notes
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              12
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Notes Table */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>NOTES &amp;</span>
                <span style={{ color: '#F5C518' }}>VALIDATION ITEMS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
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
                    borderBottom: '1px solid rgba(123,77,255,.38)',
                    background: idx % 2 === 0 ? 'rgba(255,255,255,.04)' : 'transparent',
                  }}
                >
                  <div style={{ width: '260px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '21px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase', lineHeight: '23px' }}>
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
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,.4)' }} />
            <div className="wm" style={{ fontSize: '22px', letterSpacing: '9px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Convengers Bahay Build
            </div>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,.4)' }} />
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: '#F5C518', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
