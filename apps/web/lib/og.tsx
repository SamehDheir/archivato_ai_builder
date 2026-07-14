import { ImageResponse } from 'next/og';
import {
  brand,
  siteDescription,
  siteName,
  sitePipeline,
  siteTagline,
  siteUrl,
} from '@/lib/site';

/** Standard OpenGraph/Twitter card dimensions (1.91:1). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/**
 * The social share card, rasterized to PNG at request time by Satori.
 *
 * Scrapers (X, LinkedIn, Slack, iMessage) do not render SVG, so this cannot be
 * a static brand asset — it has to be a real PNG, which is why it goes through
 * ImageResponse rather than living in `public/`.
 *
 * Two Satori constraints shape the markup below, and breaking either one throws
 * at render time rather than degrading:
 *   - every element with more than one child needs an explicit `display: flex`;
 *   - only the bundled font is available, and it ships a single weight, so the
 *     hierarchy here is built from size, color, and letter-spacing rather than
 *     from font-weight (a `fontWeight: 700` would silently render as regular).
 */
/** The brand lockup shared by both cards. */
function ogHeader(host: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg width="56" height="56" viewBox="0 0 64 64">
        <g
          fill="none"
          stroke="#EEF2FF"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 50 32 15 47 50" />
          <path d="M23.3 36h17.4" />
        </g>
        <circle cx={17} cy={50} r={4.4} fill="#A5B4FC" />
        <circle cx={47} cy={50} r={4.4} fill="#A5B4FC" />
        <circle cx={32} cy={15} r={6} fill={brand.cyan} />
      </svg>
      <div style={{ marginLeft: 16, fontSize: 34, letterSpacing: -0.5 }}>
        {siteName}
      </div>
      <div
        style={{
          display: 'flex',
          marginLeft: 'auto',
          fontSize: 22,
          color: '#8A90A6',
        }}
      >
        {host}
      </div>
    </div>
  );
}

/** The card's background — one place, so both variants stay identical. */
const OG_SHELL = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'space-between' as const,
  padding: '64px 72px',
  backgroundColor: brand.ink,
  backgroundImage: `radial-gradient(circle at 12% 0%, ${brand.indigoDeep} 0%, ${brand.ink} 62%)`,
  color: '#E8EAF3',
};

/** Facts about one shared design, rendered as the card's proof strip. */
export interface ShareOgFacts {
  title: string;
  architecture: string;
  services: number;
  tables: number;
  /**
   * Absent when the owner shared from the free tier (the API design is a Pro
   * stage). The tile is then dropped rather than shown as `0` — a "0 endpoints"
   * unfurl would advertise the design as gutted when it's merely unfinished.
   */
  endpoints?: number;
}

/**
 * The **per-project** share card (`/s/<token>`). This is the unit that actually
 * travels: when someone drops a share link in Slack or X, this image is the
 * product's first impression — so it leads with *their* project name and the
 * scale of the design, not the generic tagline.
 *
 * Same Satori rules as `ogImage()` apply (flex on every multi-child element,
 * single font weight — build hierarchy from size and color).
 */
export function shareOgImage(facts: ShareOgFacts) {
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const proof = [
    { label: 'Architecture', value: facts.architecture.replace(/_/g, ' ') },
    { label: 'Services', value: String(facts.services) },
    { label: 'Tables', value: String(facts.tables) },
    ...(facts.endpoints === undefined
      ? []
      : [{ label: 'Endpoints', value: String(facts.endpoints) }]),
  ];

  return new ImageResponse(
    (
      <div style={OG_SHELL}>
        {ogHeader(host)}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: brand.cyan,
            }}
          >
            A complete system design
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              maxWidth: 1000,
              fontSize: 60,
              lineHeight: 1.15,
              letterSpacing: -1.5,
              color: '#FFFFFF',
            }}
          >
            {truncate(facts.title, 90)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {proof.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginRight: 24,
                padding: '14px 22px',
                borderRadius: 10,
                border: '1px solid #ffffff1f',
                backgroundColor: '#ffffff0a',
              }}
            >
              <div style={{ display: 'flex', fontSize: 18, color: '#8A90A6' }}>
                {label}
              </div>
              <div
                style={{
                  display: 'flex',
                  marginTop: 4,
                  fontSize: 30,
                  color: '#FFFFFF',
                  textTransform: 'capitalize',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function ogImage() {
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: brand.ink,
          // Satori's gradient parser is much narrower than a browser's: it only
          // accepts the `circle|ellipse at <pos>` form. The explicit-size variant
          // (`radial-gradient(1000px 620px at 12% 0%, …)`) does not just degrade —
          // it kills the render, and the route returns an empty reply.
          backgroundImage: `radial-gradient(circle at 12% 0%, ${brand.indigoDeep} 0%, ${brand.ink} 62%)`,
          color: '#E8EAF3',
        }}
      >
        {/* Brand lockup. The mark is drawn in near-white rather than the brand
            indigo — on the indigo bloom, the app's indigo-on-transparent mark
            all but disappears. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <svg width="56" height="56" viewBox="0 0 64 64">
            <g
              fill="none"
              stroke="#EEF2FF"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 50 32 15 47 50" />
              <path d="M23.3 36h17.4" />
            </g>
            <circle cx={17} cy={50} r={4.4} fill="#A5B4FC" />
            <circle cx={47} cy={50} r={4.4} fill="#A5B4FC" />
            <circle cx={32} cy={15} r={6} fill={brand.cyan} />
          </svg>
          <div style={{ marginLeft: 16, fontSize: 34, letterSpacing: -0.5 }}>
            {siteName}
          </div>
          <div
            style={{
              display: 'flex',
              marginLeft: 'auto',
              fontSize: 22,
              color: '#8A90A6',
            }}
          >
            {host}
          </div>
        </div>

        {/* Headline + subline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: brand.cyan,
            }}
          >
            AI Software Architecture Generator
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              maxWidth: 900,
              fontSize: 64,
              lineHeight: 1.15,
              letterSpacing: -1.5,
              color: '#FFFFFF',
            }}
          >
            {siteTagline}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              maxWidth: 880,
              fontSize: 26,
              lineHeight: 1.45,
              color: '#A9AFC4',
            }}
          >
            {siteDescription.split(' — ')[0]} — every artifact structured,
            editable, and versioned.
          </div>
        </div>

        {/* Pipeline strip */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          {sitePipeline.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid #ffffff1f',
                  backgroundColor: '#ffffff0a',
                  fontSize: 21,
                  color: '#D3D7E4',
                }}
              >
                {step}
              </div>
              {i < sitePipeline.length - 1 && (
                <div
                  style={{
                    display: 'flex',
                    margin: '0 10px',
                    fontSize: 20,
                    color: '#5A6076',
                  }}
                >
                  ›
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
