/**
 * DownloadAppButton — App Store badge that lives in the global header.
 *
 *   • Web only (caller hides on Capacitor native).
 *   • On ≥ md screens: shows "Download app" label + Apple logo.
 *   • On phones: collapses to the Apple icon only so it doesn't crowd
 *     the search bar / user dropdown / notification bell.
 *   • Links straight to the Czech App Store listing (same link used in
 *     About.jsx, the launch modal, and the retention email).
 */
import React from 'react';

const APP_STORE_URL = 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs';

export default function DownloadAppButton() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        try { window.gtag && window.gtag('event', 'header_download_app_click'); } catch {}
      }}
      aria-label="Download LaChart on the App Store"
      title="Download LaChart for iPhone"
      className="
        relative inline-flex items-center justify-center gap-2
        h-9 px-2.5 sm:px-3.5
        rounded-lg bg-black text-white
        font-semibold text-[12.5px] leading-none
        shadow-sm hover:shadow active:scale-[0.98]
        transition-all duration-150
        touch-manipulation
      "
    >
      {/* Apple SVG — mirrors the App Store badge mark */}
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/>
      </svg>
      <span className="hidden sm:inline">Download&nbsp;app</span>

      {/* "New" pulsing dot — drops off after the first month organically when
          we remove it; for now it signals launch freshness. */}
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-pink-500 ring-2 ring-zinc-50 animate-pulse"
      />
    </a>
  );
}
