// Enhanced Google Analytics (gtag) helper with comprehensive tracking

let initialized = false;

/** 'ios' | 'android' | 'web' — Capacitor injects window.Capacitor in the app. */
function detectPlatform() {
  try {
    const p = window.Capacitor?.getPlatform?.();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}

/**
 * Platform & native-app enhancements, applied on every init (web + app):
 *  - user property `app_platform` (web/ios/android) so GA4 reports can segment
 *    the Capacitor app from the browser (GA otherwise shows everything as WEB),
 *  - on native, a stable client_id persisted in localStorage — WKWebView
 *    cookie behaviour on capacitor://localhost is unreliable, and without this
 *    every app launch can look like a brand-new user.
 */
function applyPlatformConfig(measurementId) {
  const platform = detectPlatform();
  const isNativeApp = platform !== 'web';
  window.gtag('set', 'user_properties', {
    app_platform: platform,
    app_mode: isNativeApp ? 'native_app' : 'web',
  });
  if (isNativeApp) {
    let cid = null;
    try {
      cid = localStorage.getItem('lachart_ga_client_id');
      if (!cid) {
        cid = (window.crypto?.randomUUID?.() || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`);
        localStorage.setItem('lachart_ga_client_id', cid);
      }
    } catch { /* private mode — fall back to cookie behaviour */ }
    window.gtag('config', measurementId, {
      send_page_view: false, // page views come from trackPageView on route change
      ...(cid ? { client_id: cid } : {}),
      cookie_flags: 'SameSite=None;Secure',
    });
  }
}

export function initAnalytics(measurementId) {
  if (initialized || !measurementId) return;
  try {
    // gtag may already be loaded from the HTML snippet — still apply the
    // platform enhancements below (the old code returned early here, which
    // left the native app untagged).
    if (!window.gtag) {
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
        gtag('config', '${measurementId}', {
          send_page_view: false,
          custom_map: {
            'custom_parameter_1': 'user_type',
            'custom_parameter_2': 'conversion_funnel'
          }
        });
      `;
      document.head.appendChild(script2);
    }

    applyPlatformConfig(measurementId);
    initialized = true;
  } catch (e) {
    console.error('Analytics initialization failed:', e);
  }
}

export function trackPageView(path) {
  if (!initialized || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: document.title,
    page_location: window.location.href
  });
}

export function trackEvent(action, params = {}) {
  if (!initialized || !window.gtag) return;
  window.gtag('event', action, {
    ...params,
    timestamp: new Date().toISOString()
  });
}

// --- Google Ads conversions / custom events ---

// Example: dedicated conversion for "Kontakt na ten stránky" from Google Ads
export function trackAdsConversionKontakt(params = {}) {
  if (!initialized || !window.gtag) return;
  window.gtag('event', 'ads_conversion_Kontakt_Na_ten_str_nky__1', {
    ...params,
  });
}

// Enhanced tracking functions for key metrics

export function trackUserRegistration(method, userRole = 'athlete') {
  trackEvent('user_registration', {
    method: method, // 'email', 'google', 'facebook'
    user_role: userRole,
    event_category: 'user_engagement',
    event_label: 'registration_completed'
  });
}

export function trackDemoUsage(action, details = {}) {
  trackEvent('demo_usage', {
    action: action, // 'page_view', 'test_completed', 'cta_click'
    ...details,
    event_category: 'demo_engagement',
    user_type: 'anonymous'
  });
}

export function trackConversionFunnel(step, details = {}) {
  trackEvent('conversion_funnel', {
    funnel_step: step, // 'demo_view', 'demo_complete', 'signup_start', 'signup_complete', 'login'
    ...details,
    event_category: 'conversion',
    conversion_funnel: step
  });
}

export function trackLactateTestCompletion(testData = {}) {
  trackEvent('lactate_test_completed', {
    test_type: testData.sport || 'unknown',
    stages_count: testData.stages || 0,
    has_results: testData.hasResults || false,
    event_category: 'feature_usage',
    event_label: 'lactate_analysis'
  });
}

export function trackGuideInteraction(action, section = '') {
  trackEvent('guide_interaction', {
    action: action, // 'view', 'scroll', 'section_click', 'cta_click'
    section: section,
    event_category: 'content_engagement',
    event_label: 'lactate_guide'
  });
}

export function trackFeatureUsage(feature, action, details = {}) {
  trackEvent('feature_usage', {
    feature: feature, // 'dashboard', 'testing', 'training', 'athletes'
    action: action, // 'view', 'create', 'edit', 'delete'
    ...details,
    event_category: 'feature_engagement'
  });
}

export function trackError(error, context = {}) {
  trackEvent('error_occurred', {
    error_type: error.type || 'unknown',
    error_message: error.message || 'Unknown error',
    page: context.page || window.location.pathname,
    user_agent: navigator.userAgent,
    event_category: 'error_tracking'
  });
}

// ── Business events (subscription funnel + feature adoption) ────────────────

/** User clicked through to Stripe checkout. GA4 recommended event name. */
export function trackCheckoutStarted(plan, source) {
  trackEvent('begin_checkout', {
    plan: plan || 'pro',
    source, // 'upgrade_modal' | 'welcome_paywall' | 'about_page' | 'settings'
    event_category: 'subscription',
  });
}

/** Strava / Garmin / Apple Health successfully connected. */
export function trackIntegrationConnected(provider) {
  trackEvent('integration_connected', {
    provider, // 'strava' | 'garmin' | 'apple_health'
    event_category: 'feature_usage',
  });
}

/** Lactate report PDF downloaded; `branded` = coach logo/name applied. */
export function trackPdfReportExported({ branded = false } = {}) {
  trackEvent('pdf_report_exported', {
    branded: branded ? 'branded' : 'default',
    event_category: 'feature_usage',
  });
}

/** New-user feature tour finished or dismissed. */
export function trackFeatureTourClosed(lastStep) {
  trackEvent('feature_tour_closed', {
    last_step: lastStep ?? null,
    event_category: 'onboarding',
  });
}


