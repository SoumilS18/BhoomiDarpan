import React from 'react';

interface NationalEmblemProps {
  className?: string;
  size?: number | string;
  variant?: 'gold' | 'terracotta' | 'white' | 'dark' | 'monochrome';
}

/**
 * State Emblem of India (Lion Capital of Ashoka)
 * Rendered as an SVG icon component for official state portal branding.
 */
export const NationalEmblem: React.FC<NationalEmblemProps> = ({
  className = '',
  size = 32,
  variant = 'gold',
}) => {
  const getFillColor = () => {
    switch (variant) {
      case 'gold':
        return '#C9A84C'; // Dusty Gold
      case 'terracotta':
        return '#8B3A2A'; // Terracotta
      case 'white':
        return '#FFFFFF';
      case 'dark':
        return '#2B2523';
      case 'monochrome':
      default:
        return 'currentColor';
    }
  };

  const fill = getFillColor();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block select-none shrink-0 ${className}`}
      aria-label="State Emblem of India"
      role="img"
    >
      <g fill={fill}>
        {/* Top: Three Lions Crown Silhouette */}
        {/* Central Lion Head */}
        <path d="M 42 16 C 42 10, 58 10, 58 16 C 60 14, 63 15, 62 19 C 62 23, 60 27, 57 32 C 59 36, 57 41, 56 46 L 44 46 C 43 41, 41 36, 43 32 C 40 27, 38 23, 38 19 C 37 15, 40 14, 42 16 Z" />
        {/* Central Lion Mane & Facial Carvings */}
        <path d="M 46 22 C 48 20, 52 20, 54 22 C 55 24, 55 27, 54 29 C 52 30, 48 30, 46 29 C 45 27, 45 24, 46 22 Z" opacity="0.4" fill="#000" />
        <path d="M 47 33 L 53 33 L 52 38 L 48 38 Z" opacity="0.3" fill="#000" />
        
        {/* Left Lion Head & Shoulder */}
        <path d="M 28 22 C 26 18, 36 17, 38 23 C 38 28, 36 34, 33 39 C 35 42, 33 46, 31 49 L 23 48 C 21 43, 22 36, 25 31 C 24 28, 24 24, 28 22 Z" />
        <path d="M 27 27 C 29 26, 33 27, 33 30 C 33 33, 30 35, 28 34 C 26 33, 26 29, 27 27 Z" opacity="0.35" fill="#000" />

        {/* Right Lion Head & Shoulder */}
        <path d="M 72 22 C 74 18, 64 17, 62 23 C 62 28, 64 34, 67 39 C 65 42, 67 46, 69 49 L 77 48 C 79 43, 78 36, 75 31 C 76 28, 76 24, 72 22 Z" />
        <path d="M 73 27 C 71 26, 67 27, 67 30 C 67 33, 70 35, 72 34 C 74 33, 74 29, 73 27 Z" opacity="0.35" fill="#000" />

        {/* Lions Torso & Paws Support */}
        <path d="M 26 49 C 28 47, 72 47, 74 49 C 76 53, 76 58, 73 62 L 27 62 C 24 58, 24 53, 26 49 Z" />

        {/* Capital Pedestal / Abacus Upper Rim */}
        <rect x="18" y="63" width="64" height="4" rx="1.5" />

        {/* Abacus Center: Ashoka Chakra with Spokes */}
        <circle cx="50" cy="74" r="8" stroke={fill} strokeWidth="1.8" fill="none" />
        <circle cx="50" cy="74" r="2.2" fill={fill} />
        {/* Spokes */}
        <line x1="50" y1="66" x2="50" y2="82" stroke={fill} strokeWidth="0.9" />
        <line x1="42" y1="74" x2="58" y2="74" stroke={fill} strokeWidth="0.9" />
        <line x1="44.34" y1="68.34" x2="55.66" y2="79.66" stroke={fill} strokeWidth="0.9" />
        <line x1="55.66" y1="68.34" x2="44.34" y2="79.66" stroke={fill} strokeWidth="0.9" />
        <line x1="42.34" y1="70.89" x2="57.66" y2="77.11" stroke={fill} strokeWidth="0.7" />
        <line x1="42.34" y1="77.11" x2="57.66" y2="70.89" stroke={fill} strokeWidth="0.7" />
        <line x1="46.89" y1="66.34" x2="53.11" y2="81.66" stroke={fill} strokeWidth="0.7" />
        <line x1="53.11" y1="66.34" x2="46.89" y2="81.66" stroke={fill} strokeWidth="0.7" />

        {/* Left Side: Galloping Horse Silhouette */}
        <path d="M 22 75 C 24 72, 29 70, 33 72 C 34 74, 32 77, 30 78 C 28 78, 26 79, 25 80 L 23 80 C 22 79, 21 77, 22 75 Z" />

        {/* Right Side: Indian Bull Silhouette */}
        <path d="M 78 75 C 76 72, 71 70, 67 72 C 66 74, 68 77, 70 78 C 72 78, 74 79, 75 80 L 77 80 C 78 79, 79 77, 78 75 Z" />

        {/* Abacus Lower Rim */}
        <rect x="16" y="83" width="68" height="3.5" rx="1.5" />

        {/* Inverted Bell Lotus Base */}
        <path d="M 22 87 C 28 89, 36 93, 50 93 C 64 93, 72 89, 78 87 C 76 96, 68 101, 50 101 C 32 101, 24 96, 22 87 Z" />
        <path d="M 30 92 C 38 97, 44 98, 50 98 C 56 98, 62 97, 70 92" stroke={fill} strokeWidth="1" fill="none" opacity="0.7" />

        {/* Base Pedestal Platform */}
        <rect x="14" y="102" width="72" height="3" rx="1.5" />

        {/* Satyameva Jayate (Devanagari Script Typography in micro vector) */}
        <text
          x="50"
          y="114"
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="700"
          fontFamily="'Noto Sans Devanagari', 'Yatra One', 'Arial Unicode MS', sans-serif"
          letterSpacing="0.08em"
          fill={fill}
        >
          सत्यमेव जयते
        </text>
      </g>
    </svg>
  );
};
