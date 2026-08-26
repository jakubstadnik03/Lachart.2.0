import React, { useEffect, useState } from 'react';
import { getCalendarFeedUrl, rotateCalendarFeedUrl } from '../../services/api';

/**
 * Settings card: subscribe to the planned-training ICS feed from Apple /
 * Google Calendar. The webcal:// link opens Apple Calendar's subscribe dialog
 * directly on iPhone/Mac; Google users paste the https URL under
 * "Other calendars → From URL". The feed is read-only and auto-refreshes on
 * the calendar app's own schedule, so newly planned workouts (with the lap
 * breakdown in the event description) show up without re-subscribing.
 */
export default function CalendarFeedCard({ isMobile }) {
  const [feed, setFeed] = useState(null); // { url, webcalUrl }
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCalendarFeedUrl()
      .then((d) => { if (!cancelled) setFeed(d); })
      .catch(() => { if (!cancelled) setError('Could not load the calendar link.'); });
    return () => { cancelled = true; };
  }, []);

  const copyUrl = async () => {
    if (!feed?.url) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — long-press the link to copy it manually.');
    }
  };

  const rotate = async () => {
    if (!window.confirm('Generate a new link? Calendars subscribed with the old link will stop updating.')) return;
    setRotating(true);
    try {
      setFeed(await rotateCalendarFeedUrl());
    } catch {
      setError('Could not generate a new link.');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className={`bg-white ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200 ${isMobile ? 'p-2.5' : 'p-6'}`}>
      <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center ${isMobile ? 'w-6 h-6' : 'w-8 h-8'} bg-indigo-50 rounded-lg`}>
            <span className="text-indigo-600 font-bold text-sm">📅</span>
          </div>
          <h4 className={`${isMobile ? 'text-xs' : 'text-lg'} font-semibold`}>Calendar subscription</h4>
        </div>
        {feed && (
          <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} font-medium text-green-600`}>Ready</span>
        )}
      </div>
      <p className={`${isMobile ? 'text-[9px]' : 'text-sm'} text-gray-600 ${isMobile ? 'mb-2' : 'mb-4'}`}>
        See your planned workouts — including the lap-by-lap breakdown — in Apple Calendar,
        Google Calendar or Outlook. The feed updates automatically as your plan changes.
      </p>

      {error && (
        <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-red-600 mb-2`}>{error}</div>
      )}

      {feed && (
        <div className={`flex ${isMobile ? 'flex-col gap-1.5' : 'items-center gap-2'}`}>
          <a
            href={feed.webcalUrl}
            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px] text-center' : 'px-3 py-2 text-sm'} bg-indigo-600 text-white ${isMobile ? 'rounded-md' : 'rounded'} font-medium hover:bg-indigo-700`}
          >
            Add to Apple Calendar
          </a>
          <button
            type="button"
            onClick={copyUrl}
            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} bg-gray-100 text-gray-700 ${isMobile ? 'rounded-md' : 'rounded'} font-medium hover:bg-gray-200`}
          >
            {copied ? 'Copied ✓' : 'Copy link (Google/Outlook)'}
          </button>
          <button
            type="button"
            onClick={rotate}
            disabled={rotating}
            className={`${isMobile ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-sm'} text-gray-400 hover:text-gray-600 ${isMobile ? '' : 'ml-auto'}`}
            title="Generate a new secret link and invalidate the old one"
          >
            {rotating ? 'Resetting…' : 'Reset link'}
          </button>
        </div>
      )}
    </div>
  );
}
