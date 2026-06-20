import React from 'react';
import SHARE_LOGO_URI from '../shareLogoUri';

/** LaChart wordmark — embedded PNG for SVG → canvas pipeline. */
export default function ShareBrandLogo({ x, y, height = 58 }) {
  const aspect = 600 / 418;
  const width = Math.round(height * aspect);
  return (
    <image
      href={SHARE_LOGO_URI}
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
