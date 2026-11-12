/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SystemSettings } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { calculateScheduleElapsed } from '../utils/calculations.ts';

export const MethodologySlide: React.FC<{ settings: SystemSettings }> = ({ settings }) => {
  const elapsed = calculateScheduleElapsed();

  const steps = [
    {
      num: 1,
      name: 'Steel columns / posts',
      window: 'Nov 14–20, 2026 (proposed shared installation window)',
      status: 'Methodology input',
      notes: 'Install columns/posts in one coordinated operation from Ground Floor to Second Floor.',
      sub: 'Must follow Ground Floor column/structural readiness; sequence and lifting/temporary stability to be confirmed by structural engineer.',
    },
    {
      num: 2,
      name: 'I-beam connections',
      window: 'Nov 21–23, 2026 (proposed)',
      status: 'Dependency-based',
      notes: 'Proceed after columns/posts are installed and secured.',
      sub: 'Confirm connections, alignment, bolting/welding inspections and temporary bracing before loading.',
    },
    {
      num: 3,
      name: 'Steel deck installation',
      window: 'Nov 24, 2026 (proposed)',
      status: 'Compressed — validate',
      notes: 'After I-beam connections are accepted.',
      sub: 'Single-day window is a planning placeholder; confirm deck quantity, access and fastening inspection.',
    },
    {
      num: 4,
      name: 'MEP embedded works',
      window: 'Nov 25, 2026 (proposed)',
      status: 'Compressed — validate',
      notes: 'After steel deck installation; complete embedded services and required checks before concrete preparation/pour.',
      sub: 'Confirm sleeves, conduits, openings and coordination sign-off.',
    },
    {
      num: 5,
      name: 'Concrete / slab works preparation',
      window: 'Nov 26, 2026 (proposed)',
      status: 'Compressed — validate',
      notes: 'After MEP embedded works; prepare formwork, reinforcement, supports and pre-pour inspections.',
      sub: 'Do not pour until structural/MEP pre-pour approvals are complete.',
    },
    {
      num: 6,
      name: 'Slab curing / structural preparation',
      window: 'Nov 27, 2026 onward as approved by engineer',
      status: 'Inspection fixed Nov 28',
      notes: 'After concrete/slab works; maintain required curing and protect the slab before subsequent loading.',
      sub: 'Curing duration and permissible loading must be set by engineer; one-day allowance is not presumed sufficient.',
    },
    {
      num: 7,
      name: 'Structural inspection',
      window: 'Nov 28, 2026 (Saturday)',
      status: 'Fixed target',
      notes: 'Inspect structural works and record punch items / approval.',
      sub: 'Inspection target retained as requested; actual readiness depends on engineer-approved sequence and curing requirements.',
    },
    {
      num: 8,
      name: 'Ground Floor stair / structural framing',
      window: 'Jan 13–20, 2027',
      windowNote: 'Shifted for the stoppage; was Jan 5–12, 2027',
      status: 'Provided date',
      notes: 'Separate stair framing activity, scheduled after the Jan 4 restart.',
      sub: 'Coordinate access and interfaces with Ground Floor finishing.',
    },
    {
      num: 9,
      name: 'Second Floor stair / structural framing',
      window: 'Jan 21–27, 2027',
      windowNote: 'Shifted for the stoppage; was Jan 13–19, 2027',
      status: 'Provided date',
      notes: 'Separate stair framing activity, scheduled after Ground Floor stair framing.',
      sub: 'Coordinate connections and safe access.',
    },
    {
      num: 10,
      name: 'Third Floor stair / structural framing',
      window: 'Jan 27–Feb 2, 2027',
      windowNote: 'Shifted for the stoppage; was Jan 19–25, 2027',
      status: 'Provided date',
      notes: 'Separate stair framing activity.',
      sub: 'Overlaps Second Floor stair framing on Jan 27; confirm whether crews/areas can operate in parallel safely.',
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
              Structural
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
              Methodology
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
              Methodology
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
              10
            </span>
            <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Table Container */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
              <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>STEP-BY-STEP</span>
                <span style={{ color: 'var(--sx-text-3)' }}>SEQUENCE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div className="mthh" style={{ display: 'flex', gap: '16px', padding: '10px 16px', background: 'var(--sx-bg-12)', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              <div style={{ width: '40px', flex: 'none' }}>#</div>
              <div style={{ width: '260px', flex: 'none' }}>Method / scope</div>
              <div style={{ width: '300px', flex: 'none' }}>Scheduled window</div>
              <div style={{ width: '170px', flex: 'none' }}>Status</div>
              <div style={{ flex: 1 }}>Sequence / dependency · notes</div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {steps.map((s, idx) => (
                <div
                  key={s.num}
                  className="mth2"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '6px 16px',
                    background: idx % 2 === 0 ? 'var(--sx-bg-39)' : 'transparent',
                    borderBottom: 'var(--sx-border-31)',
                    fontSize: '15px',
                    lineHeight: '19px',
                  }}
                >
                  <div style={{ width: '40px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)' }}>
                    {s.num}
                  </div>
                  <div style={{ width: '260px', flex: 'none', fontSize: '18px', fontWeight: 600, lineHeight: '22px', color: 'var(--sx-text-3)' }}>
                    {s.name}
                  </div>
                  <div style={{ width: '300px', flex: 'none', fontWeight: 700 }}>
                    {s.window}
                    {s.windowNote && (
                      <div style={{ fontWeight: 400, fontSize: '13px', color: 'var(--sx-text-2)', lineHeight: '17px' }}>
                        {s.windowNote}
                      </div>
                    )}
                  </div>
                  <div style={{ width: '170px', flex: 'none', color: 'var(--sx-text-2)' }}>
                    {s.status}
                  </div>
                  <div style={{ flex: 1 }}>
                    {s.notes}
                    <div style={{ color: 'var(--sx-text-2)', marginTop: '3px' }}>{s.sub}</div>
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
