/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Placeholder isometric house illustration for the Construction Journey.
 * Used only until the project's own stage illustrations are uploaded in
 * "3D Construction Journey Management". It draws the house cumulatively for
 * stages 1–9 (site preparation → finishing) in natural material colours on a
 * green site platform, and is always labelled as a reference illustration.
 */

import React from 'react';

type Pt = [number, number];
const S = 15; // scale
const CX = 160;
const CY = 92;
const P = (x: number, y: number, z: number): Pt => [CX + (x - y) * 0.866 * S, CY + (x + y) * 0.5 * S - z * S];
const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

interface Faces {
  top: string;
  left: string;
  right: string;
  stroke?: string;
}

function Box({ x, y, z, w, d, h, c }: { x: number; y: number; z: number; w: number; d: number; h: number; c: Faces }) {
  const stroke = c.stroke || 'rgba(40,40,50,0.18)';
  return (
    <g strokeWidth={0.6} stroke={stroke} strokeLinejoin="round">
      <polygon points={pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={c.left} />
      <polygon points={pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)])} fill={c.right} />
      <polygon points={pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={c.top} />
    </g>
  );
}

const C = {
  grass: { top: '#9ccc78', left: '#7fae5c', right: '#6d9a4d', stroke: 'rgba(60,90,40,0.25)' },
  soil: { top: '#c8a27a', left: '#a9835c', right: '#957250' },
  concrete: { top: '#c9ccd3', left: '#a9adb6', right: '#959aa4' },
  column: { top: '#b9bdc5', left: '#9da2ac', right: '#8b9099' },
  chb: { top: '#d9d4c9', left: '#c4bdb0', right: '#b0a99b' },
  paint: { top: '#f4efe5', left: '#ece4d4', right: '#ddd3c0' },
  wood: '#a87443',
  roof: { left: '#9b4a35', right: '#7d3a2a', top: '#b05a42' },
  glass: '#a9d3ee',
  door: '#7a5230',
};

// House footprint and levels
const X0 = 2.2;
const Y0 = 1.8;
const W = 6;
const D = 4.6;
const FLOOR = 2.6;

function Columns({ levels }: { levels: number }) {
  const xs = [X0, X0 + W / 2 - 0.15, X0 + W - 0.3];
  const ys = [Y0, Y0 + D - 0.3];
  const out: React.ReactNode[] = [];
  for (let l = 0; l < levels; l++)
    ys.forEach((y) =>
      xs.forEach((x) => out.push(<Box key={`${l}-${x}-${y}`} x={x} y={y} z={0.85 + l * FLOOR} w={0.3} d={0.3} h={FLOOR - 0.2} c={C.column} />))
    );
  return <>{out}</>;
}

function Window({ x, y, z, w, h, face }: { x: number; y: number; z: number; w: number; h: number; face: 'left' | 'right' }) {
  const poly =
    face === 'left'
      ? [P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)]
      : [P(x, y, z), P(x, y + w, z), P(x, y + w, z + h), P(x, y, z + h)];
  return <polygon points={pts(poly)} fill={C.glass} stroke="#ffffff" strokeWidth={0.8} />;
}

export const IsoHouse: React.FC<{ stage: number; title?: string }> = ({ stage, title }) => {
  const s = Math.max(1, Math.min(9, stage));
  const wallC = s >= 9 ? C.paint : C.chb;
  const top = 0.85 + FLOOR * 2;
  const ridgeY = Y0 + D / 2;
  const roofH = 1.6;
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label={title || `Reference illustration, stage ${s}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Site platform */}
      <Box x={0} y={0} z={0} w={10.4} d={8.2} h={0.6} c={C.grass} />
      {s === 1 && (
        <>
          {/* Layout strings and stakes */}
          <polygon points={pts([P(X0, Y0, 0.62), P(X0 + W, Y0, 0.62), P(X0 + W, Y0 + D, 0.62), P(X0, Y0 + D, 0.62)])} fill="rgba(255,255,255,0.25)" stroke="#ffffff" strokeDasharray="3 2" strokeWidth={1} />
          {[
            [X0, Y0],
            [X0 + W, Y0],
            [X0 + W, Y0 + D],
            [X0, Y0 + D],
          ].map(([x, y]) => (
            <Box key={`${x}${y}`} x={x - 0.08} y={y - 0.08} z={0.6} w={0.16} d={0.16} h={0.7} c={{ top: '#d9a066', left: '#b98247', right: '#a26f3a' }} />
          ))}
          <Box x={8.6} y={6.2} z={0.6} w={1.2} d={1.2} h={0.5} c={C.soil} />
        </>
      )}
      {s >= 2 && (
        <>
          {/* Footings and tie beams */}
          <Box x={X0 - 0.1} y={Y0 - 0.1} z={0.6} w={W + 0.2} d={D + 0.2} h={0.25} c={C.soil} />
          {[X0, X0 + W / 2 - 0.15, X0 + W - 0.3].map((x) =>
            [Y0, Y0 + D - 0.3].map((y) => <Box key={`f${x}${y}`} x={x - 0.15} y={y - 0.15} z={0.62} w={0.6} d={0.6} h={0.2} c={C.concrete} />)
          )}
        </>
      )}
      {s >= 3 && <Box x={X0} y={Y0} z={0.62} w={W} d={D} h={0.23} c={C.concrete} />}
      {s === 3 && <Columns levels={1} />}
      {s === 4 && (
        <>
          <Columns levels={2} />
          <Box x={X0} y={Y0} z={0.85 + FLOOR - 0.2} w={W} d={D} h={0.2} c={C.concrete} />
          <Box x={X0} y={Y0} z={top - 0.2} w={W} d={D} h={0.2} c={C.concrete} />
        </>
      )}
      {s >= 5 && (
        <>
          <Box x={X0} y={Y0} z={0.85} w={W} d={D} h={FLOOR} c={wallC} />
          <Box x={X0} y={Y0} z={0.85 + FLOOR} w={W} d={D} h={FLOOR} c={wallC} />
          <Box x={X0 - 0.05} y={Y0 - 0.05} z={0.85 + FLOOR - 0.1} w={W + 0.1} d={D + 0.1} h={0.15} c={C.concrete} />
        </>
      )}
      {s === 6 &&
        [0, 1.5, 3, 4.5, 6].map((dx) => {
          const x = X0 + Math.min(dx, W);
          return (
            <polyline
              key={dx}
              points={pts([P(x, Y0 + D, top), P(x, ridgeY, top + roofH), P(x, Y0, top), P(x, Y0 + D, top)])}
              fill="none"
              stroke={C.wood}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          );
        })}
      {s === 6 && <polyline points={pts([P(X0, ridgeY, top + roofH), P(X0 + W, ridgeY, top + roofH)])} stroke={C.wood} strokeWidth={1.8} />}
      {s >= 7 && (
        <g stroke="rgba(40,20,10,0.25)" strokeWidth={0.6}>
          {/* Gable end (right face) */}
          <polygon points={pts([P(X0 + W, Y0, top), P(X0 + W, Y0 + D, top), P(X0 + W, ridgeY, top + roofH)])} fill={wallC.right} />
          {/* Front roof plane */}
          <polygon points={pts([P(X0 - 0.3, Y0 + D + 0.35, top - 0.2), P(X0 + W + 0.3, Y0 + D + 0.35, top - 0.2), P(X0 + W + 0.3, ridgeY, top + roofH), P(X0 - 0.3, ridgeY, top + roofH)])} fill={C.roof.left} />
          {/* Back roof plane edge visible at the ridge */}
          <polygon points={pts([P(X0 - 0.3, ridgeY, top + roofH), P(X0 + W + 0.3, ridgeY, top + roofH), P(X0 + W + 0.3, Y0 - 0.35, top - 0.2)])} fill={C.roof.top} />
        </g>
      )}
      {s >= 8 && (
        <>
          {/* Windows and door on the two visible faces */}
          <Window x={X0 + 0.6} y={Y0 + D} z={1.6} w={1.2} h={1} face="left" />
          <Window x={X0 + 3.9} y={Y0 + D} z={1.6} w={1.4} h={1} face="left" />
          <Window x={X0 + 0.6} y={Y0 + D} z={1.6 + FLOOR} w={1.2} h={1} face="left" />
          <Window x={X0 + 2.5} y={Y0 + D} z={1.6 + FLOOR} w={1.2} h={1} face="left" />
          <Window x={X0 + 4.2} y={Y0 + D} z={1.6 + FLOOR} w={1.2} h={1} face="left" />
          <Window x={X0 + W} y={Y0 + 0.7} z={1.6 + FLOOR} w={1.4} h={1} face="right" />
          <Window x={X0 + W} y={Y0 + 2.6} z={1.6} w={1.2} h={1} face="right" />
          <polygon points={pts([P(X0 + 2.3, Y0 + D, 0.85), P(X0 + 3.3, Y0 + D, 0.85), P(X0 + 3.3, Y0 + D, 2.65), P(X0 + 2.3, Y0 + D, 2.65)])} fill={C.door} stroke="#ffffff" strokeWidth={0.6} />
        </>
      )}
      {s >= 9 && (
        <>
          {/* Path and planting */}
          <polygon points={pts([P(X0 + 2.3, Y0 + D, 0.61), P(X0 + 3.3, Y0 + D, 0.61), P(X0 + 3.3, 8.2, 0.61), P(X0 + 2.3, 8.2, 0.61)])} fill="#e8e2d6" />
          {[
            [0.9, 6.6],
            [9.3, 1.2],
            [9.1, 6.9],
          ].map(([x, y]) => {
            const [px, py] = P(x, y, 1.3);
            const [bx, by] = P(x, y, 0.6);
            return (
              <g key={`${x}${y}`}>
                <line x1={bx} y1={by} x2={px} y2={py} stroke="#7a5230" strokeWidth={2} />
                <circle cx={px} cy={py - 6} r={11} fill="#5f9e4a" />
                <circle cx={px - 5} cy={py - 2} r={7} fill="#6fb257" />
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
};
