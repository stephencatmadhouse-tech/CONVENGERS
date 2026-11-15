/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-width Project Management Master Tracker branding header shown above
 * the system toolbar (internal Project Management System and the Executive & Client Portal).
 */

import React from 'react';

const HEADER_BANNER = '/assets/aistudio/ChatGPT_Image_Oct_2__2026__07_17_46_PM_57c7d066.png';

export const BrandHeader: React.FC<{ subtitle?: string; right?: React.ReactNode }> = ({ subtitle, right }) => (
  <header className="cb-brand" role="banner">
    <div className="cb-brand-art" aria-hidden="true">
      <img
        src={HEADER_BANNER}
        alt=""
        referrerPolicy="no-referrer"
        className="cb-brand-banner-img"
      />
      <div className="cb-brand-scrim" />
    </div>
    <div className="cb-brand-text">
      <h1 className="cb-brand-title">Project Management Master Tracker</h1>
      <div className="cb-brand-sub">
        <span className="cb-brand-sub-main">Bahay Build 2.0</span>
        {subtitle && (
          <>
            <span className="cb-brand-sep" aria-hidden="true">·</span>
            <span className="cb-brand-sub-ctx">{subtitle}</span>
          </>
        )}
      </div>
    </div>
    {right && <div className="cb-brand-right">{right}</div>}
  </header>
);
