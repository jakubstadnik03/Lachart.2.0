import React, { useEffect, useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthProvider';
import WhatsNewModal, { whatsNewSeenKey } from '../WhatsNewModal';
import { isCapacitorNative } from '../../utils/isNativeApp';

/**
 * WhatsNewButton
 *
 * Small ✨ button in the global header that re-opens the WhatsNewModal on
 * demand. Lives next to the notification bell so the affordance is always
 * one click away — even users who dismissed the auto-popup can come back
 * and re-read what shipped in this release.
 *
 * Unseen-state badge: shows a red dot when the current release's flag is
 * not set in localStorage (= the user hasn't dismissed the auto-popup yet).
 * Clicking opens the modal AND clears the dot. We re-check whenever the
 * modal opens / closes so the badge accurately tracks state changes from
 * the auto-popup elsewhere on the page.
 *
 * Hidden on native iOS for consistency with the auto-popup (which is also
 * suppressed there to keep App Store-review-safe — some slides deep-link
 * into web-only flows).
 */
export default function WhatsNewButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  // Recompute the unseen badge whenever the user changes or the modal
  // toggles. localStorage isn't reactive, so this is the simplest way
  // to stay in sync with the auto-popup writing its flag elsewhere.
  useEffect(() => {
    if (!user?._id) { setUnseen(false); return; }
    const seen = localStorage.getItem(whatsNewSeenKey(user._id));
    setUnseen(!seen);
  }, [user?._id, open]);

  if (isCapacitorNative()) return null;
  if (!user?._id) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
        aria-label="What's new"
        title="What's new in LaChart"
      >
        <SparklesIcon className="h-6 w-6 text-gray-500" />
        {unseen && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-zinc-50"
            aria-label="Unread updates"
          />
        )}
      </button>
      <WhatsNewModal
        open={open}
        onClose={() => setOpen(false)}
        userName={user?.name}
      />
    </>
  );
}
