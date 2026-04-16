import { Capacitor } from '@capacitor/core';

let backListenerHandle;

/**
 * One-time setup for Capacitor iOS/Android WebView: splash, status bar, hardware back.
 */
export async function initCapacitorShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // plugin missing or already hidden
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    // iOS: @capacitor/status-bar implements setOverlaysWebView as unimplemented() — do not call.
    // Android: optional overlay so layout matches CSS safe-area (see Layout + index.css).
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch {
    // ignore
  }

  try {
    const { App } = await import('@capacitor/app');
    if (!backListenerHandle) {
      backListenerHandle = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        void App.exitApp();
      });
    }
  } catch {
    // ignore
  }
}
