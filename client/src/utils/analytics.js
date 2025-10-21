// Enhanced Google Analytics (gtag) helper with comprehensive tracking

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
      gtag('config', '${measurementId}', { 
        send_page_view: false,
        custom_map: {
          'custom_parameter_1': 'user_type',
          'custom_parameter_2': 'conversion_funnel'
        }
      });
    `;
    document.head.appendChild(script2);

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


