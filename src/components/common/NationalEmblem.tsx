import React from 'react';

interface NationalEmblemProps {
  className?: string;
  size?: number | string;
  variant?: 'gold' | 'terracotta' | 'white' | 'dark' | 'monochrome';
}

/**
 * State Emblem of India (Lion Capital of Ashoka)
 * Rendered as an elegant, unboxed SVG vector brandmark that blends natively
 * into light or dark backgrounds with zero box/card enclosures.
 */
export const NationalEmblem: React.FC<NationalEmblemProps> = ({
  className = '',
  size = 44,
  variant = 'gold',
}) => {
  const getColors = () => {
    switch (variant) {
      case 'gold':
        return {
          primary: '#C9A84C', // Dusty Gold
          highlight: '#E2C26E',
          shadow: '#A3812A',
        };
      case 'terracotta':
        return {
          primary: '#8B3A2A',
          highlight: '#A94A38',
          shadow: '#662417',
        };
      case 'white':
        return {
          primary: '#FFFFFF',
          highlight: '#FFFFFF',
          shadow: '#E2E8F0',
        };
      case 'dark':
        return {
          primary: '#2B2320',
          highlight: '#443733',
          shadow: '#1A1412',
        };
      case 'monochrome':
      default:
        return {
          primary: 'currentColor',
          highlight: 'currentColor',
          shadow: 'currentColor',
        };
    }
  };

  const colors = getColors();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 144"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block select-none shrink-0 transition-transform duration-200 ${className}`}
      aria-label="State Emblem of India"
      role="img"
    >
      <g>
        {/* ========================================================= */}
        {/* LION CAPITAL (TOP SECTION) - Three Visible Guardian Lions  */}
        {/* ========================================================= */}

        {/* --- CENTRAL LION --- */}
        {/* Lion Crown & Mane Outer Silhouette */}
        <path
          d="M 52 14 C 52 7, 68 7, 68 14 C 71 12, 75 14, 74 18 C 74 23, 71 28, 68 34 C 70 39, 68 44, 67 50 L 53 50 C 52 44, 50 39, 52 34 C 49 28, 46 23, 46 18 C 45 14, 49 12, 52 14 Z"
          fill={colors.primary}
        />
        {/* Central Lion Ears & Forehead Details */}
        <path d="M 53 15 C 55 11, 65 11, 67 15 C 68 20, 66 25, 60 27 C 54 25, 52 20, 53 15 Z" fill={colors.highlight} opacity="0.9" />
        <path d="M 56 20 C 57 18, 63 18, 64 20 C 64 22, 63 24, 60 25 C 57 24, 56 22, 56 20 Z" fill={colors.shadow} opacity="0.6" />
        {/* Central Lion Eyes & Muzzle */}
        <ellipse cx="57" cy="22" rx="1.2" ry="1" fill={colors.shadow} />
        <ellipse cx="63" cy="22" rx="1.2" ry="1" fill={colors.shadow} />
        <path d="M 58.5 25 L 61.5 25 L 60 28 Z" fill={colors.shadow} />
        {/* Central Lion Whiskers & Mane Curls */}
        <path d="M 54 30 C 56 28, 64 28, 66 30 C 67 34, 65 38, 60 40 C 55 38, 53 34, 54 30 Z" fill={colors.highlight} opacity="0.75" />
        <path d="M 56 34 C 58 32, 62 32, 64 34 C 64 37, 62 40, 60 41 C 58 40, 56 37, 56 34 Z" fill={colors.primary} />
        <path d="M 57 44 L 63 44 L 62 49 L 58 49 Z" fill={colors.shadow} opacity="0.5" />

        {/* --- LEFT LION (Profile Facing Left) --- */}
        <path
          d="M 34 22 C 31 17, 43 16, 46 23 C 46 29, 43 36, 39 42 C 41 46, 39 50, 36 54 L 27 53 C 24 47, 26 39, 29 33 C 28 30, 28 25, 34 22 Z"
          fill={colors.primary}
        />
        {/* Left Lion Snout & Jaw Profile */}
        <path d="M 27 26 C 30 24, 35 25, 35 29 C 35 32, 31 34, 29 33 C 27 32, 26 28, 27 26 Z" fill={colors.highlight} opacity="0.8" />
        <ellipse cx="30" cy="28" rx="1.2" ry="1" fill={colors.shadow} />
        <path d="M 26 30 C 29 30, 32 32, 30 35 C 28 35, 26 33, 26 30 Z" fill={colors.shadow} opacity="0.6" />
        {/* Left Lion Mane Waves */}
        <path d="M 34 35 C 37 38, 38 43, 36 48 C 33 47, 31 43, 32 39 C 32 37, 33 36, 34 35 Z" fill={colors.highlight} opacity="0.7" />

        {/* --- RIGHT LION (Profile Facing Right) --- */}
        <path
          d="M 86 22 C 89 17, 77 16, 74 23 C 74 29, 77 36, 81 42 C 79 46, 81 50, 84 54 L 93 53 C 96 47, 94 39, 91 33 C 92 30, 92 25, 86 22 Z"
          fill={colors.primary}
        />
        {/* Right Lion Snout & Jaw Profile */}
        <path d="M 93 26 C 90 24, 85 25, 85 29 C 85 32, 89 34, 91 33 C 93 32, 94 28, 93 26 Z" fill={colors.highlight} opacity="0.8" />
        <ellipse cx="90" cy="28" rx="1.2" ry="1" fill={colors.shadow} />
        <path d="M 94 30 C 91 30, 88 32, 90 35 C 92 35, 94 33, 94 30 Z" fill={colors.shadow} opacity="0.6" />
        {/* Right Lion Mane Waves */}
        <path d="M 86 35 C 83 38, 82 43, 84 48 C 87 47, 89 43, 88 39 C 88 37, 87 36, 86 35 Z" fill={colors.highlight} opacity="0.7" />

        {/* Lions Unified Chest & Forepaws Pedestal Support */}
        <path
          d="M 30 53 C 33 51, 87 51, 90 53 C 93 58, 92 64, 89 69 L 31 69 C 28 64, 27 58, 30 53 Z"
          fill={colors.primary}
        />
        <path d="M 40 54 C 44 53, 76 53, 80 54 C 83 58, 82 64, 79 67 L 41 67 C 38 64, 37 58, 40 54 Z" fill={colors.highlight} opacity="0.5" />

        {/* ========================================================= */}
        {/* ABACUS FRIEZE (MIDDLE SECTION)                            */}
        {/* ========================================================= */}

        {/* Upper Abacus Beading / Molding */}
        <rect x="20" y="70" width="80" height="4.5" rx="2" fill={colors.primary} />
        <rect x="22" y="71" width="76" height="1.5" rx="0.75" fill={colors.highlight} opacity="0.8" />

        {/* Abacus Center: Full Ashoka Chakra (24 Spokes Wheel) */}
        <circle cx="60" cy="84" r="10" stroke={colors.primary} strokeWidth="2.2" fill="none" />
        <circle cx="60" cy="84" r="2.8" fill={colors.primary} />
        <circle cx="60" cy="84" r="1.2" fill={colors.highlight} />

        {/* 24-Spoke Radial Geometry */}
        <line x1="60" y1="74" x2="60" y2="94" stroke={colors.primary} strokeWidth="1.1" />
        <line x1="50" y1="84" x2="70" y2="84" stroke={colors.primary} strokeWidth="1.1" />
        <line x1="52.93" y1="76.93" x2="67.07" y2="91.07" stroke={colors.primary} strokeWidth="1.1" />
        <line x1="67.07" y1="76.93" x2="52.93" y2="91.07" stroke={colors.primary} strokeWidth="1.1" />
        <line x1="50.44" y1="80.12" x2="69.56" y2="87.88" stroke={colors.primary} strokeWidth="0.8" />
        <line x1="50.44" y1="87.88" x2="69.56" y2="80.12" stroke={colors.primary} strokeWidth="0.8" />
        <line x1="56.12" y1="74.44" x2="63.88" y2="93.56" stroke={colors.primary} strokeWidth="0.8" />
        <line x1="63.88" y1="74.44" x2="56.12" y2="93.56" stroke={colors.primary} strokeWidth="0.8" />

        {/* Left Frieze: Galloping Horse of Ashoka */}
        <path
          d="M 25 85 C 27 81, 33 79, 38 82 C 40 84, 38 87, 35 89 C 32 89, 30 90, 29 92 L 26 92 C 25 91, 24 88, 25 85 Z"
          fill={colors.primary}
        />
        <path d="M 29 82 C 32 80, 36 82, 36 84 C 34 85, 30 84, 29 82 Z" fill={colors.highlight} opacity="0.8" />

        {/* Right Frieze: Bull of Ashoka (Vrishabha) */}
        <path
          d="M 95 85 C 93 81, 87 79, 82 82 C 80 84, 82 87, 85 89 C 88 89, 90 90, 91 92 L 94 92 C 95 91, 96 88, 95 85 Z"
          fill={colors.primary}
        />
        <path d="M 91 82 C 88 80, 84 82, 84 84 C 86 85, 90 84, 91 82 Z" fill={colors.highlight} opacity="0.8" />

        {/* Lower Abacus Molding */}
        <rect x="18" y="95" width="84" height="4.5" rx="2" fill={colors.primary} />
        <rect x="20" y="96" width="80" height="1.5" rx="0.75" fill={colors.highlight} opacity="0.8" />

        {/* ========================================================= */}
        {/* BELL LOTUS BASE (LOWER SECTION)                           */}
        {/* ========================================================= */}
        <path
          d="M 26 100 C 34 103, 44 107, 60 107 C 76 107, 86 103, 94 100 C 91 111, 81 117, 60 117 C 39 117, 29 111, 26 100 Z"
          fill={colors.primary}
        />
        {/* Lotus Petal Fluting Accents */}
        <path d="M 34 106 C 44 112, 52 113, 60 113 C 68 113, 76 112, 86 106" stroke={colors.highlight} strokeWidth="1.4" fill="none" opacity="0.8" />
        <path d="M 42 103 L 44 114" stroke={colors.shadow} strokeWidth="1" opacity="0.5" />
        <line x1="60" y1="102" x2="60" y2="116" stroke={colors.highlight} strokeWidth="1.2" opacity="0.7" />
        <path d="M 78 103 L 76 114" stroke={colors.shadow} strokeWidth="1" opacity="0.5" />

        {/* Grounding Base Platform */}
        <rect x="16" y="118" width="88" height="4" rx="2" fill={colors.primary} />
        <rect x="18" y="119" width="84" height="1.2" rx="0.6" fill={colors.highlight} opacity="0.8" />

        {/* ========================================================= */}
        {/* NATIONAL MOTTO: SATYAMEVA JAYATE (सत्यमेव जयते)           */}
        {/* ========================================================= */}
        <text
          x="60"
          y="136"
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="800"
          fontFamily="'Noto Sans Devanagari', 'Yatra One', 'Tiro Devanagari Hindi', 'Arial Unicode MS', sans-serif"
          letterSpacing="0.1em"
          fill={colors.primary}
          className="font-bold drop-shadow-2xs"
        >
          सत्यमेव जयते
        </text>
      </g>
    </svg>
  );
};
