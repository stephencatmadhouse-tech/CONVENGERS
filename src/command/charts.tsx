/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chart.js (loaded once from cdnjs) for the Executive Dashboard and Calendar
 * forecast. If the CDN cannot be reached (offline, blocked network) every
 * chart falls back to a plain, readable list of the same numbers.
 */

import React, { useEffect, useRef, useState } from 'react';

const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

let loader: Promise<any> | null = null;
function loadChartJs(): Promise<any> {
  const w = window as any;
  if (w.Chart) return Promise.resolve(w.Chart);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHART_SRC;
    s.async = true;
    s.crossOrigin = 'anonymous';
    const t = setTimeout(() => reject(new Error('timeout')), 12000);
    s.onload = () => {
      clearTimeout(t);
      w.Chart ? resolve(w.Chart) : reject(new Error('Chart.js missing'));
    };
    s.onerror = () => {
      clearTimeout(t);
      reject(new Error('Chart.js could not be loaded'));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loader = null;
    throw e;
  });
  return loader;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface ChartSpec {
  type: 'doughnut' | 'bar';
  labels: string[];
  datasets: { label: string; data: number[]; color: string | string[] }[];
  horizontal?: boolean;
  stacked?: boolean;
  legend?: boolean;
  onClick?: (index: number, datasetIndex: number) => void;
}

export const ChartBox: React.FC<{ spec: ChartSpec; height?: number; label: string }> = ({ spec, height = 240, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify({ ...spec, onClick: undefined });
  const clickRef = useRef(spec.onClick);
  clickRef.current = spec.onClick;

  useEffect(() => {
    let alive = true;
    loadChartJs()
      .then((Chart) => {
        if (!alive || !ref.current) return;
        chart.current?.destroy();
        const ink = cssVar('--cv-dim', '#777777');
        const grid = cssVar('--cv-line', '#eaeaea');
        const panel = cssVar('--cv-panel', '#ffffff');
        Chart.defaults.font.family = 'Barlow, system-ui, sans-serif';
        Chart.defaults.color = ink;
        const isDonut = spec.type === 'doughnut';
        chart.current = new Chart(ref.current, {
          type: spec.type,
          data: {
            labels: spec.labels,
            datasets: spec.datasets.map((d) => ({
              label: d.label,
              data: d.data,
              backgroundColor: d.color,
              borderColor: isDonut ? panel : undefined,
              borderWidth: isDonut ? 2 : 0,
              borderRadius: isDonut ? 0 : 4,
              maxBarThickness: spec.horizontal ? 14 : 26,
            })),
          },
          options: {
            maintainAspectRatio: false,
            responsive: true,
            indexAxis: spec.horizontal ? 'y' : 'x',
            cutout: isDonut ? '66%' : undefined,
            animation: { duration: 250 },
            onClick: (_e: any, els: any[]) => {
              if (els?.length && clickRef.current) clickRef.current(els[0].index, els[0].datasetIndex);
            },
            onHover: (e: any, els: any[]) => {
              if (e?.native?.target) e.native.target.style.cursor = els?.length && clickRef.current ? 'pointer' : 'default';
            },
            plugins: {
              legend: { display: spec.legend ?? (isDonut || spec.datasets.length > 1), position: isDonut ? 'right' : 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
              tooltip: { mode: isDonut ? 'nearest' : 'index', intersect: isDonut },
            },
            scales: isDonut
              ? undefined
              : {
                  x: { stacked: !!spec.stacked, grid: { color: spec.horizontal ? grid : 'transparent' }, beginAtZero: true, ticks: { precision: 0 } },
                  y: { stacked: !!spec.stacked, grid: { color: spec.horizontal ? 'transparent' : grid }, beginAtZero: true, ticks: { precision: 0, autoSkip: false } },
                },
          },
        });
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => chart.current?.destroy(), []);

  if (failed) {
    return (
      <div className="ex-chart-fallback" role="table" aria-label={label}>
        <div className="cv-dim" style={{ fontSize: 12, marginBottom: 6 }}>Chart library unavailable offline — figures shown as a list.</div>
        {spec.labels.map((l, i) => (
          <div key={l} className="ex-fb-row">
            <span>{l}</span>
            <b>{spec.datasets.map((d) => d.data[i] || 0).reduce((a, b) => a + b, 0)}</b>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  );
};
