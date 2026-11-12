/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LOGO_SVG } from '../constants/assets.ts';

interface BrandLogoProps {
  variant?: 'slide' | 'toolbar' | 'report';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'slide',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  const dims =
    variant === 'toolbar'
      ? { width: 32, height: 32, radius: 7, scale: 1.14, border: '1.5px solid rgba(245, 197, 24, 0.55)' }
      : variant === 'report'
      ? { width: 84, height: 84, radius: 12, scale: 1.14, border: '2px solid #7B4DFF' }
      : { width: 156, height: 150, radius: 14, scale: 1.14, border: '2px solid rgba(245, 197, 24, 0.45)' };

  return (
    <div
      className={`brand-logo-emblem ${className}`}
      style={{
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        flex: 'none',
        position: 'relative',
        borderRadius: `${dims.radius}px`,
        overflow: 'hidden',
        border: dims.border,
        background:
          'radial-gradient(circle at 50% 45%, #3B1DB8 0%, #12174D 58%, #060A24 100%)',
        boxShadow:
          variant === 'report'
            ? '0 4px 12px rgba(10, 17, 64, 0.25)'
            : variant === 'toolbar'
            ? '0 0 10px rgba(123, 77, 255, 0.5)'
            : '0 6px 22px rgba(123, 77, 255, 0.55), 0 0 0 1px rgba(123, 77, 255, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!failed ? (
        <img
          src={LOGO_SVG}
          alt="Convengers Construction Multiverse Logo"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="sync"
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            transform: `scale(${dims.scale})`,
            display: 'block',
          }}
        />
      ) : (
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-label="Convengers Construction Multiverse Emblem"
        >
          <defs>
            <linearGradient id="convGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFE169" />
              <stop offset="100%" stopColor="#D49B00" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="#060A24" />
          <path
            d="M54 10 L36 48 H52 L44 90 L70 44 H53 Z"
            fill="rgba(123,77,255,0.45)"
          />
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fill="url(#convGold)"
            fontFamily="Anton, Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="44"
          >
            C
          </text>
        </svg>
      )}
    </div>
  );
};
