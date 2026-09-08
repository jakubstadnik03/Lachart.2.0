/**
 * The bar that says whose account you are looking at, and gets you out of it.
 *
 * Impersonating used to be one-way: an admin opened an athlete's account and
 * then had to log out and back in to be themselves again. This sits above
 * everything while a session is borrowed, so it is never a surprise whose data
 * is on screen, and leaving is one click.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { getReturnSession, clearReturnSession } from '../utils/impersonation';

export default function ImpersonationBar() {
  const { login, user, token } = useAuth();
  const [ret, setRet] = useState(() => getReturnSession());
  const [leaving, setLeaving] = useState(false);

  // The stash is written by the admin page just before it hands the tab over,
  // so this has to notice it without a reload.
  useEffect(() => {
    const refresh = () => setRet(getReturnSession());
    window.addEventListener('impersonationChanged', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('impersonationChanged', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Back on the admin's own account, the bar has nothing to say.
  //
  // Decided on the token, not on the user id. The id alone is not enough: a
  // stale or slow profile read can hand back the admin's own record while the
  // borrowed token is still in play, and clearing on that would throw away the
  // only way back at precisely the wrong moment.
  useEffect(() => {
    if (ret && token && token === ret.token) {
      clearReturnSession();
      setRet(null);
    }
  }, [ret, token]);

  const goBack = useCallback(async () => {
    const session = getReturnSession();
    if (!session || leaving) return;
    setLeaving(true);
    try {
      // Clear first: login() wipes the auth keys but not this one, and a
      // failure part-way through should not leave a stale way back.
      clearReturnSession();
      await login(null, null, session.token, session.user);
      setRet(null);
      window.dispatchEvent(new Event('impersonationChanged'));
    } catch (e) {
      console.error('Could not return to the admin account:', e);
      setLeaving(false);
    }
  }, [login, leaving]);

  if (!ret) return null;

  const who = user?.name || user?.email || 'this athlete';

  return (
    <div className="sticky top-0 z-[10060] w-full bg-amber-500 text-white shadow-md">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-[12px] sm:text-[13px]">
        <span className="font-semibold">Signed in as {who}</span>
        <span className="hidden text-amber-100 sm:inline">
          — you are looking at someone else&apos;s data
        </span>
        <button
          type="button"
          onClick={goBack}
          disabled={leaving}
          className="ml-auto rounded-md bg-white/95 px-2.5 py-1 text-[12px] font-bold text-amber-700 transition-colors hover:bg-white disabled:opacity-60"
        >
          {leaving ? 'Switching…' : `Back to ${ret.user.name || 'admin'}`}
        </button>
      </div>
    </div>
  );
}
