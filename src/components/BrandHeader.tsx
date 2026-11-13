/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-width Convengers branding header shown above the system toolbar
 * (internal Project Management System and the Executive & Client Portal).
 */

import React from 'react';
import wordmarkUrl from '../assets/images/convengers_wordmark.jpg';

export const BrandHeader: React.FC<{ subtitle?: string }> = ({ subtitle = 'Project Management System' }) => (
  <header className="cb-brand" role="banner">
    <div className="cb-brand-mark">
      <img src={wordmarkUrl} alt="Convengers — Construction Multiverse" width={232} height={108} />
    </div>
    <span className="cb-brand-div" aria-hidden />
    <div className="cb-brand-text">
      <div className="cb-brand-l1">Convengers Assemble</div>
      <div className="cb-brand-l2">
        Bahay Build
      </div>
      <div className="cb-brand-l3">{subtitle}</div>
    </div>
  </header>
);
