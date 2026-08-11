/**
 * The app's icon set.
 *
 * Everything here is drawn on a 24×24 grid in one flat, single-weight style —
 * the look of Spotify's own player UI — because the emoji this app used before
 * rendered differently on every device (colourful on iOS, flat grey on Windows,
 * missing entirely on some Android builds) and could not take the accent colour.
 *
 * Glyphs inherit `currentColor`, so an icon is coloured by the CSS of whatever
 * it sits in. Size comes from the `size` prop, but plain CSS beats the width and
 * height attributes, so a container can scale an icon too (see `.placeholder`).
 */

import type { ReactNode } from 'react';

/** Solid shapes have to opt out of the stroke set on the <svg>. */
const FILL = { fill: 'currentColor', stroke: 'none' } as const;

/** Shared speaker cone, so the three volume states stay identical below it. */
const CONE = (
  <path
    {...FILL}
    d="M12.6 4.4 7.9 8.3H4.8a1.3 1.3 0 0 0-1.3 1.3v4.8a1.3 1.3 0 0 0 1.3 1.3h3.1l4.7 3.9a.85.85 0 0 0 1.4-.65V5.05a.85.85 0 0 0-1.4-.65Z"
  />
);

const GLYPHS = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.75" />
      <path d="M15.6 15.6 20.5 20.5" />
    </>
  ),

  'search-off': (
    <>
      <circle cx="10.5" cy="10.5" r="6.75" />
      <path d="M15.6 15.6 20.5 20.5" />
      <path d="m8.4 8.4 4.2 4.2M12.6 8.4l-4.2 4.2" strokeWidth={1.6} />
    </>
  ),

  // Spotify's own shelf mark: two upright spines and one leaning against them.
  library: (
    <>
      <path
        {...FILL}
        d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H3Zm7 0a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1h-2Z"
      />
      <path
        {...FILL}
        d="M18.086 20.27 14.586 7.21a1 1 0 0 1 .707-1.225l1.93-.517a1 1 0 0 1 1.225.707l3.5 13.06a1 1 0 0 1-.707 1.224l-1.93.518a1 1 0 0 1-1.225-.707Z"
      />
    </>
  ),

  help: (
    <>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M9.1 9.3a2.95 2.95 0 1 1 3.9 2.85c-.72.25-1 .8-1 1.55v.55" />
      <circle {...FILL} cx="12" cy="17.6" r="1.2" />
    </>
  ),

  play: (
    <path
      {...FILL}
      d="M7.05 3.606l13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606Z"
    />
  ),

  pause: (
    <path
      {...FILL}
      d="M5.7 3a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7H5.7Zm10 0a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-2.6Z"
    />
  ),

  next: (
    <path
      {...FILL}
      d="M17.7 3a.7.7 0 0 0-.7.7v6.805L5.05 3.606A.7.7 0 0 0 4 4.212v15.576a.7.7 0 0 0 1.05.606L17 13.495V20.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-1.6Z"
    />
  ),

  previous: (
    <>
      <path
        {...FILL}
        d="M4 3.7a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v16.6a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7V3.7Z"
      />
      <path
        {...FILL}
        d="M18.95 3.606A.7.7 0 0 1 20 4.212v15.576a.7.7 0 0 1-1.05.606L7.4 13.106a.7.7 0 0 1 0-1.212l11.55-6.288Z"
      />
    </>
  ),

  speaker: (
    <>
      <rect x="4.75" y="2.25" width="14.5" height="19.5" rx="3" />
      <circle cx="12" cy="15" r="3.6" />
      <circle {...FILL} cx="12" cy="7.2" r="1.3" />
    </>
  ),

  'speaker-off': (
    <>
      {CONE}
      <path d="m17.4 9.8 4.6 4.6M22 9.8l-4.6 4.6" />
    </>
  ),

  'volume-low': (
    <>
      {CONE}
      <path d="M16.8 9.6a3.9 3.9 0 0 1 0 4.8" />
    </>
  ),

  'volume-high': (
    <>
      {CONE}
      <path d="M16.8 9.6a3.9 3.9 0 0 1 0 4.8" />
      <path d="M19.4 7a7.6 7.6 0 0 1 0 10" />
    </>
  ),

  'chevron-down': <path d="m6 9.5 6 6 6-6" strokeWidth={2.1} />,

  'chevron-right': <path d="m9.5 6 6 6-6 6" strokeWidth={2.1} />,

  tv: (
    <>
      <rect x="2.5" y="4.25" width="19" height="13.5" rx="2.5" />
      <path d="M8 21h8" />
    </>
  ),

  radio: (
    <>
      <path d="M7.5 7.2 17.8 3.2" />
      <rect x="2.75" y="7.2" width="18.5" height="13.6" rx="2.6" />
      <circle cx="15.5" cy="14" r="3.1" />
      <path d="M7 11.4h.01M7 14h.01M7 16.6h.01" strokeWidth={2.4} />
    </>
  ),

  album: (
    <>
      <circle cx="12" cy="12" r="9.25" />
      <circle cx="12" cy="12" r="3.1" />
      <circle {...FILL} cx="12" cy="12" r="1" />
    </>
  ),

  artist: (
    <>
      <rect {...FILL} x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5.6 11.6a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 18v3.4M8.6 21.4h6.8" />
    </>
  ),

  podcast: (
    <>
      <rect {...FILL} x="9.4" y="2.5" width="5.2" height="10" rx="2.6" />
      <path d="M6.6 10.4a5.4 5.4 0 0 0 10.8 0" />
      <path d="M12 15.8v3.1M8.9 18.9h6.2" />
      <path d="M3.6 5.4a8.4 8.4 0 0 0 0 6.4M20.4 5.4a8.4 8.4 0 0 1 0 6.4" strokeWidth={1.7} />
    </>
  ),

  playlist: (
    <>
      <path d="M3.5 6.5h11M3.5 12h11M3.5 17.5h7" />
      <path d="M20.6 14.2V4.4" />
      <circle {...FILL} cx="18.2" cy="14.2" r="2.4" />
    </>
  ),

  note: (
    <>
      <path d="M11.4 17.6V6.3L20 4.1v11.3" />
      <circle {...FILL} cx="8.4" cy="17.6" r="3" />
      <circle {...FILL} cx="17" cy="15.4" r="3" />
    </>
  ),

  key: (
    <>
      <circle cx="7.6" cy="16.4" r="4.1" />
      <path d="M10.5 13.5 20.5 3.5M17.4 6.6l2.6 2.6M14.9 9.1l2.2 2.2" />
    </>
  ),

  wifi: (
    <>
      <path d="M2.4 8.6a14.5 14.5 0 0 1 19.2 0" />
      <path d="M5.8 12.4a9.6 9.6 0 0 1 12.4 0" />
      <path d="M9.1 16.1a4.7 4.7 0 0 1 5.8 0" />
      <circle {...FILL} cx="12" cy="19.9" r="1.5" />
    </>
  ),

  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),

  headphones: (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>
  ),

  check: <path d="m4.5 12.5 5 5 10-11" strokeWidth={2.4} />,

  close: <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" strokeWidth={2.4} />,

  alert: (
    <>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 7.3v6" strokeWidth={2.1} />
      <circle {...FILL} cx="12" cy="16.6" r="1.25" />
    </>
  ),

  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.6 20.6a7.4 7.4 0 0 1 14.8 0" />
    </>
  ),

  // The Spotify wordmark's circle, used only where the app names Spotify itself.
  spotify: (
    <path
      {...FILL}
      d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0m5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02m1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2m.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3"
    />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

/**
 * Icons are decoration: every one of them sits next to a label, or in a control
 * that carries its own `aria-label`, so they are hidden from screen readers.
 */
export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}

/**
 * The bouncing bars Spotify shows next to the row that is playing. Motion is
 * the point — it says "this one, right now" without needing a label — so it
 * stops for anyone who has asked the system for less of it (see styles.css).
 */
export function PlayingBars() {
  return (
    <span className="eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
