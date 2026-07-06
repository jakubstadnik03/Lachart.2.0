/**
 * Bundled LaChart logo — webpack emits this into the JS/CSS bundle so the
 * native Capacitor WebView always resolves it (absolute /images/LaChart.png
 * paths can be missing after cap sync).
 */
import logoUrl from '../assets/LaChart.png';

export const BRAND_LOGO_SRC = logoUrl;
export default logoUrl;
