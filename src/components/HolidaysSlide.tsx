/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SystemSettings } from '../types/index.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { calculateScheduleElapsed } from '../utils/calculations.ts';

export const HolidaysSlide: React.FC<{ settings: SystemSettings }> = ({ settings }) => {
  const elapsed = calculateScheduleElapsed();

  const holidays = [
    { date: 'Nov 2, 2026', day: 'Mon', title: "All Souls' Day — additional special non-working day" },
    { date: 'Nov 16, 2026', day: 'Mon', title: 'NCR-only special non-working day (Proclamation No. 1449)' },
    { date: 'Nov 17, 2026', day: 'Tue', title: 'NCR-only special non-working day (Proclamation No. 1449)' },
    { date: 'Nov 18, 2026', day: 'Wed', title: 'NCR-only special non-working day (Proclamation No. 1449)' },
    { date: 'Nov 30, 2026', day: 'Mon', title: 'Bonifacio Day — regular holiday' },
    { date: 'Dec 8, 2026', day: 'Tue', title: 'Feast of the Immaculate Conception — special non-working day' },
    { date: 'Dec 24, 2026', day: 'Thu', title: 'Christmas Eve — additional special non-working day' },
    { date: 'Dec 25, 2026', day: 'Fri', title: 'Christmas Day — regular holiday' },
    { date: 'Dec 30, 2026', day: 'Wed', title: 'Rizal Day — regular holiday' },
    { date: 'Dec 31, 2026', day: 'Thu', title: 'Last Day of the Year — special non-working day' },
    { date: 'Jan 1, 2027', day: 'Fri', title: "New Year's Day — regular holiday" },
    { date: 'Feb 6, 2027', day: 'Sat', title: 'Chinese New Year — additional special non-working day' },
    { date: 'Mar 25, 2027', day: 'Thu', title: 'Maundy Thursday — regular holiday' },
    { date: 'Mar 26, 2027', day: 'Fri', title: 'Good Friday — regular holiday' },
    { date: 'Mar 27, 2027', day: 'Sat', title: 'Black Saturday — additional special non-working day' },
    { date: 'Apr 9, 2027', day: 'Fri', title: 'Araw ng Kagitingan — regular holiday' },
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
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', clipPath: 'polygon(0 0,98% 0,81% 100%,0 100%)', borderRadius: '10px 0 0 10px' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Watch items &amp;
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Holidays
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
              Watch items
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              07
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 11
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Panel 1: Watch Items */}
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>WATCH</span>
                <span style={{ color: '#FF9A1F' }}>ITEMS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div style={{ padding: '16px' }}>
              <div style={{ background: '#FFE4E9', color: '#1A1030', borderRadius: '10px', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '17px', lineHeight: '22px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E0213B', flex: 'none', marginTop: '7px' }} />
                  <span>
                    The original Apr 8, 2027 overall construction target is superseded by the updated end-of-project dates: punchlist Apr 7, rectification Apr 8–24, interior styling Apr 26–27, move-in Apr 28–29 and turnover ceremony Apr 30, 2027. Review them against all floor finishing, punchlist, inspection and turnover dependencies. Ground Floor punchlist / rectification (Apr 13–14) falls inside the rectification period.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E0213B', flex: 'none', marginTop: '7px' }} />
                  <span>
                    Work stops after Dec 19, 2026 and resumes Jan 4, 2027: activities after Dec 19 move by 7 working days with durations unchanged; activities in progress across the break continue on Jan 4.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E0213B', flex: 'none', marginTop: '7px' }} />
                  <span>
                    The Second Floor structural sequence is highly compressed and must be validated by the structural engineer, especially concrete curing, load transfer, inspection hold points, and safe access.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E0213B', flex: 'none', marginTop: '7px' }} />
                  <span>
                    Second and Third Floor stair framing overlap on Jan 27: confirm workface and safety feasibility.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E0213B', flex: 'none', marginTop: '7px' }} />
                  <span>
                    Review before adopting as an approved baseline; proposed date changes require site-team approval.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: Philippine Holidays */}
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                2
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>PHILIPPINE</span>
                <span style={{ color: '#4BE08A' }}>HOLIDAYS APPLIED</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 16px 16px', gap: '10px' }}>
              <div style={{ fontSize: '14px', color: '#BAC4E2', lineHeight: '19px' }}>
                Includes nationwide 2026/2027 holidays and the NCR-only Nov 16–18, 2026 non-working days. Eid dates are excluded pending separate proclamation; confirm any site/local shutdowns.
              </div>

              <div className="hgrid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridAutoRows: '1fr', gap: '12px' }}>
                {holidays.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(123,77,255,.38)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: '2px',
                    }}
                  >
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '26px', color: '#F5C518', lineHeight: 1.1 }}>
                      {h.date} <span style={{ fontSize: '16px', fontWeight: 600, color: '#BAC4E2' }}>· {h.day}</span>
                    </div>
                    <div style={{ fontSize: '15px', lineHeight: '19px' }}>{h.title}</div>
                  </div>
                ))}
              </div>
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
