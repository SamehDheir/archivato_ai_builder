import { ImageResponse } from 'next/og';
import { brand } from '@/lib/site';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * The iOS home-screen icon. It must be a raster image — Safari ignores an SVG
 * `apple-touch-icon` — so the brand mark is redrawn here rather than pointing at
 * `logo-icon.svg`. Keep it visually in sync with `app/icon.svg`.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // iOS masks the corners itself, so the tile is drawn edge-to-edge.
          backgroundImage: `linear-gradient(${brand.indigo}, ${brand.indigoDeep})`,
        }}
      >
        <svg width="128" height="128" viewBox="0 0 64 64">
          <g
            fill="none"
            stroke="#EEF2FF"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 50 32 15 47 50" />
            <path d="M23.3 36h17.4" />
          </g>
          <circle cx={17} cy={50} r={4.6} fill="#A5B4FC" />
          <circle cx={47} cy={50} r={4.6} fill="#A5B4FC" />
          <circle cx={32} cy={15} r={6.2} fill={brand.cyan} />
        </svg>
      </div>
    ),
    size,
  );
}
