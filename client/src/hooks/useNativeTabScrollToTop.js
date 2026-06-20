import { useEffect } from 'react';

/**
 * Re-tapping an active bottom-tab dispatches `nl-tab-reclicked`.
 * Scroll the NativeLayout content scroller back to the top.
 */
export default function useNativeTabScrollToTop(tabKey) {
  useEffect(() => {
    if (!tabKey) return undefined;
    const onReclick = (e) => {
      if (e?.detail?.key !== tabKey) return;
      const scroller = document.getElementById('nl-content-scroll');
      if (scroller) {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('nl-tab-reclicked', onReclick);
    return () => window.removeEventListener('nl-tab-reclicked', onReclick);
  }, [tabKey]);
}
