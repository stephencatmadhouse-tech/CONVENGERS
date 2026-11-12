/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Serializes the complete 12-slide dashboard presentation into a standalone,
 * offline-ready HTML file that can be opened in any web browser without a server.
 */
export function exportDashboardAsHtml(fileName?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const stageEl = document.getElementById('stage');
  if (!stageEl) {
    throw new Error('Presentation stage could not be located on the page.');
  }

  // Clone the stage to preserve active input values and avoid modifying live DOM
  const clone = stageEl.cloneNode(true) as HTMLElement;

  // Preserve values of input elements (percent inputs, text fields, etc.)
  const origInputs = stageEl.querySelectorAll<HTMLInputElement>('input');
  const cloneInputs = clone.querySelectorAll<HTMLInputElement>('input');
  origInputs.forEach((orig, idx) => {
    if (cloneInputs[idx]) {
      cloneInputs[idx].setAttribute('value', orig.value);
      if (orig.checked) {
        cloneInputs[idx].setAttribute('checked', 'checked');
      }
    }
  });

  // Preserve selected options of select elements
  const origSelects = stageEl.querySelectorAll<HTMLSelectElement>('select');
  const cloneSelects = clone.querySelectorAll<HTMLSelectElement>('select');
  origSelects.forEach((orig, idx) => {
    if (cloneSelects[idx]) {
      Array.from(cloneSelects[idx].options).forEach((opt) => {
        if (opt.value === orig.value) {
          opt.setAttribute('selected', 'selected');
        } else {
          opt.removeAttribute('selected');
        }
      });
    }
  });

  // Remove any transient popups, collaborator focus markers, or active modals from the export
  clone.querySelectorAll('.collaborator-focus, .auth-modal, .admin-modal, .delrow, .addbar').forEach((el) => {
    el.remove();
  });

  // Extract all CSS rules from the document's stylesheets
  let inlinedStyles = '';
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const sheet = document.styleSheets[i];
      const rules = sheet.cssRules || sheet.rules;
      if (rules) {
        for (let j = 0; j < rules.length; j++) {
          inlinedStyles += rules[j].cssText + '\n';
        }
      }
    } catch {
      // Ignore cross-origin stylesheet security restrictions
    }
  }

  // Also collect any <style> tags in document.head
  const headStyles = Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent || '')
    .join('\n');

  const todayStr = new Date().toISOString().split('T')[0];
  const finalFileName = fileName || `Convengers_Bahay_Build_Timeline_${todayStr}.html`;

  const htmlDocument = `<!DOCTYPE html>
<html lang="en" data-eff="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Convengers Assemble — Bahay Build Timeline (Exported ${todayStr})</title>
  <meta name="description" content="Convengers Bahay Build: Interactive full-stack project dashboard for timeline, scopes of work, concrete pouring milestones, and production calendar." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --s: 1;
      color-scheme: dark;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #03051a;
      font-family: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    /* Standalone Export Header & Jump Bar */
    .export-topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 20px;
      background: #0A1140;
      border-bottom: 2px solid #7B4DFF;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      flex-wrap: wrap;
    }
    .export-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: 2px;
      color: #F5C518;
    }
    .export-brand span.domain {
      font-family: monospace;
      font-size: 11px;
      color: #BAC4E2;
      background: #060A24;
      border: 1px solid #7B4DFF;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .export-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .export-nav button {
      font: 600 12px 'Barlow', sans-serif;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(123, 77, 255, 0.5);
      background: #121C5A;
      color: #BAC4E2;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .export-nav button:hover {
      background: #7B4DFF;
      color: #ffffff;
      border-color: #F5C518;
    }
    .export-nav button.primary {
      background: #F5C518;
      color: #060A24;
      border-color: #F5C518;
      font-weight: 700;
    }
    .export-nav button.primary:hover {
      background: #ffda55;
    }
    .stage {
      padding: 24px 0 60px;
      overflow-x: auto;
    }
    .wrap {
      width: calc(1920px * var(--s));
      height: calc(1280px * var(--s));
      margin: 0 auto 32px;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(0,0,0,0.65);
      border-radius: 8px;
    }
    .slide {
      transform: scale(var(--s));
      transform-origin: 0 0;
    }
    @media print {
      .export-topbar {
        display: none !important;
      }
      .stage {
        padding: 0 !important;
        margin: 0 !important;
      }
      .wrap {
        box-shadow: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        page-break-after: always;
        break-after: page;
      }
    }
    ${headStyles}
    ${inlinedStyles}
  </style>
</head>
<body>
  <div class="export-topbar">
    <div class="export-brand">
      <span>CONVENGERS ASSEMBLE</span>
      <span class="domain">www.ConvengersAssemble.com</span>
    </div>
    <div class="export-nav">
      <span style="font-size: 11px; font-weight: 700; color: #F5C518; text-transform: uppercase; margin-right: 4px;">Jump to:</span>
      <button type="button" onclick="jumpTo('s1')">01 Overview</button>
      <button type="button" onclick="jumpTo('s2')">02 Upcoming</button>
      <button type="button" onclick="jumpTo('s3')">03 GF</button>
      <button type="button" onclick="jumpTo('s4')">04 2F</button>
      <button type="button" onclick="jumpTo('s5')">05 3F</button>
      <button type="button" onclick="jumpTo('s6')">06 Pours</button>
      <button type="button" onclick="jumpTo('s7')">07 Calendar</button>
      <button type="button" onclick="jumpTo('s8')">08 Episodes</button>
      <button type="button" onclick="jumpTo('s9')" style="background:#7B4DFF;color:#F5C518;font-weight:700;">★ 09 Master</button>
      <button type="button" onclick="jumpTo('s10')">10 Methodology</button>
      <button type="button" onclick="jumpTo('s11')">11 Holidays</button>
      <button type="button" onclick="jumpTo('s12')">12 Notes</button>
      <button type="button" class="primary" onclick="window.print()">🖨️ Print / Save PDF</button>
    </div>
  </div>

  ${clone.outerHTML}

  <script>
    // Responsive stage scaling
    function resizeStage() {
      var w = window.innerWidth;
      var s = Math.min(1, Math.max((w - 32) / 1920, w < 900 ? 0.42 : 0));
      document.documentElement.style.setProperty('--s', String(s));
    }
    window.addEventListener('resize', resizeStage);
    resizeStage();

    function jumpTo(slideId) {
      var el = document.getElementById(slideId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  </script>
</body>
</html>`;

  const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
