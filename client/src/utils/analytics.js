// Lightweight Google Analytics (gtag) helper

let initialized = false;

export function initAnalytics(measurementId) {
  if (initialized || !measurementId) return;
  try {
    // Check if gtag is already loaded from HTML
    if (window.gtag) {
      initialized = true;
      return;
    }

    // Inject gtag script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);} 
      gtag('js', new Date());
      gtag('config', '${measurementId}', { send_page_view: false });
    `;
    document.head.appendChild(script2);

    initialized = true;
  } catch (e) {
    // no-op
  }
}

export function trackPageView(path) {
  if (!initialized || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path
  });
}

export function trackEvent(action, params = {}) {
  if (!initialized || !window.gtag) return;
  window.gtag('event', action, params);
}


