import React from 'react';

interface NationalEmblemProps {
  className?: string;
  size?: number | string;
  variant?: 'gold' | 'terracotta' | 'white' | 'dark' | 'monochrome';
}

/**
 * State Emblem of India (Lion Capital of Ashoka)
 * Detailed, intricate, precise gold engraving outline that floats seamlessly
 * on any background with zero bounding box.
 */
export const NationalEmblem: React.FC<NationalEmblemProps> = ({
  className = '',
  size = 48,
}) => {
  const numericHeight = typeof size === 'number' ? size : parseInt(String(size), 10) || 48;
  const numericWidth = Math.round(numericHeight * 0.71);

  return (
    <img
      src="/national-emblem.png"
      alt="State Emblem of India"
      width={numericWidth}
      height={numericHeight}
      style={{
        width: `${numericWidth}px`,
        height: `${numericHeight}px`,
        objectFit: 'contain',
      }}
      className={`inline-block select-none shrink-0 pointer-events-none filter drop-shadow-2xs ${className}`}
      draggable={false}
      loading="eager"
    />
  );
};
