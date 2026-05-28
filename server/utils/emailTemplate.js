/**
 * Unified branded email wrapper for LaChart.
 *
 * Every transactional email (welcome, trial-ending reminder, payment receipt,
 * cancel/reactivate, password reset, weekly report, demo test results,
 * outreach, etc.) passes through `generateEmailTemplate()` so the visual
 * chrome stays consistent and on-brand.
 *
 * The CSS palette and typography mirror the public-facing app
 * (client/tailwind.config.js): purple primary (#767EB5), coral accent
 * (#FF6B4A), ink text (#0A0E1A). All styles are inlined because Gmail,
 * Yahoo, Outlook.com strip the <style> block out of the body. Web fonts
 * are deliberately NOT loaded — every major mail client ignores @font-face
 * silently and they only bloat the HTML. We fall back to a clean system
 * font stack instead.
 *
 * Layout uses <table> elements for the outer skeleton because Outlook
 * (still in use by many of the coaches we're emailing) renders divs with
 * inconsistent margins and breaks flexbox / CSS grid entirely.
 *
 * Callers MUST keep the same API:
 *   generateEmailTemplate({ title, content, buttonText, buttonUrl,
 *                           loginButtonText, loginButtonUrl, footerText })
 * — they receive a full <!DOCTYPE html> document back, ready to drop into
 * a nodemailer `html:` field.
 */

// Always use production URL for emails to avoid localhost issues
const CLIENT_URL = process.env.NODE_ENV === 'production'
  ? 'https://lachart.net'
  : (process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://lachart.net');

// 192px logo PNG already lives in client/public — used in PWA manifest too.
// We point straight at it instead of mailing inline base64 because (a) it
// stays the same file size whether 1 or 1000 recipients open the mail, and
// (b) most mail clients lazy-load remote images on demand, so the email
// body itself stays small.
const LOGO_URL = `${CLIENT_URL}/logo192.png`;

// ── Brand tokens ─────────────────────────────────────────────────────────────
// Inlined here so we don't pull a CSS framework at email-send time. Anything
// you change here ripples to every transactional email instantly. Kept in
// sync with client/tailwind.config.js + server/email-templates/*.html.
const BRAND = {
  primary:       '#767EB5',  // signature purple — buttons, links, hero
  primaryDark:   '#5E6590',
  primaryTint:   '#E9ECF6',  // wash background for callouts
  accent:        '#FF6B4A',  // warm coral — primary CTA, key data
  accentDark:    '#E85535',
  accentTint:    '#FFE6DF',
  ink:           '#0A0E1A',  // headlines
  text:          '#1D2C4C',  // body copy
  textLight:     '#4A5E82',  // secondary copy
  textMuted:     '#6B7280',  // footer / disclaimers
  bg:            '#F3F4F6',  // outer page background
  surface:       '#FFFFFF',  // card surface
  border:        '#E5E7EB',
  borderSoft:    '#F1F2F5',
};

// Font stack — system fonts only. @font-face is a no-op in email.
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Generate a full HTML email with the LaChart brand wrapper.
 *
 * @param {Object} options
 * @param {String} options.title             - Email headline (also rendered into <title>)
 * @param {String} options.content           - Main body HTML (any tags allowed)
 * @param {String} [options.buttonText]      - Primary CTA label (coral)
 * @param {String} [options.buttonUrl]       - Primary CTA href
 * @param {String} [options.loginButtonText] - Secondary CTA label (purple outline)
 * @param {String} [options.loginButtonUrl]  - Secondary CTA href
 * @param {String} [options.footerText]      - Extra disclaimer / postscript above footer
 * @returns {String} Complete HTML document
 */
function generateEmailTemplate({
  title,
  content,
  buttonText,
  buttonUrl,
  loginButtonText,
  loginButtonUrl,
  footerText,
}) {
  // Pre-render conditional blocks so the main template literal stays readable.
  const primaryCta = (buttonText && buttonUrl) ? `
    <tr>
      <td style="padding: 0 40px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center">
              <a href="${buttonUrl}"
                 style="display: inline-block; padding: 14px 32px; background-color: ${BRAND.accent}; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; letter-spacing: -0.1px; box-shadow: 0 2px 6px rgba(255, 107, 74, 0.28);">
                ${buttonText}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const secondaryCta = (loginButtonText && loginButtonUrl) ? `
    <tr>
      <td style="padding: 4px 40px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center">
              <a href="${loginButtonUrl}"
                 style="display: inline-block; padding: 13px 30px; background-color: #ffffff; color: ${BRAND.primary}; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; border: 2px solid ${BRAND.primary};">
                ${loginButtonText}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const footerNote = footerText ? `
    <tr>
      <td style="padding: 18px 40px 0;">
        <p style="margin: 0; color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.55;">
          ${footerText}
        </p>
      </td>
    </tr>` : '';

  // Pad bottom of body when there are no CTAs / footer note so the card
  // doesn't end flush against the footer divider.
  const bottomPad = (primaryCta || secondaryCta || footerNote) ? '' : `
    <tr><td style="padding: 0 40px 8px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<!--[if mso]>
<style>
  /* Outlook-specific font fallback. Without this MSO renders Times New Roman. */
  body, table, td, p, a, h1, h2, h3 { font-family: 'Segoe UI', Arial, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.bg}; font-family: ${FONT_STACK}; color: ${BRAND.text}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">

<!-- Preheader: hidden snippet that mail clients show in the inbox preview row,
     right after the subject line. We mirror the title here so the inbox shows
     a meaningful summary instead of "View this email in your browser…". -->
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; opacity: 0; color: transparent; visibility: hidden;">
  ${title} — LaChart
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background-color: ${BRAND.bg};">
  <tr>
    <td align="center" style="padding: 32px 16px;">

      <!-- Outer card — 600px is the email-safe max width (Outlook + Gmail clip beyond ~640) -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: ${BRAND.surface}; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04);">

        <!-- ── Hero / brand strip ─────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding: 28px 40px 24px; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%);">
            <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:520px;height:80px;">
                <v:fill type="gradient" color="${BRAND.primary}" color2="${BRAND.primaryDark}" angle="135"/>
                <v:textbox inset="0,0,0,0">
            <![endif]-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right: 10px;">
                  <img src="${LOGO_URL}" alt="" width="40" height="40" style="display: block; width: 40px; height: 40px; border: 0;">
                </td>
                <td valign="middle">
                  <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1;">LaChart</span>
                </td>
              </tr>
            </table>
            <!--[if mso]>
                </v:textbox>
              </v:rect>
            <![endif]-->
          </td>
        </tr>

        <!-- ── Title ─────────────────────────────────────────────────────── -->
        <tr>
          <td style="padding: 36px 40px 12px;">
            <h1 style="margin: 0; color: ${BRAND.ink}; font-size: 26px; line-height: 1.25; font-weight: 800; letter-spacing: -0.4px;">
              ${title}
            </h1>
          </td>
        </tr>

        <!-- ── Body copy ─────────────────────────────────────────────────── -->
        <tr>
          <td style="padding: 8px 40px 20px;">
            <div style="color: ${BRAND.text}; font-size: 16px; line-height: 1.65;">
              ${content}
            </div>
          </td>
        </tr>

        ${primaryCta}
        ${secondaryCta}
        ${footerNote}
        ${bottomPad}

        <!-- ── Footer ────────────────────────────────────────────────────── -->
        <tr>
          <td style="padding: 28px 40px 32px; background-color: ${BRAND.borderSoft}; border-top: 1px solid ${BRAND.border};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center">
                  <p style="margin: 0 0 6px; color: ${BRAND.ink}; font-size: 14px; font-weight: 700; letter-spacing: -0.1px;">
                    LaChart
                  </p>
                  <p style="margin: 0 0 14px; color: ${BRAND.textMuted}; font-size: 12.5px; line-height: 1.5;">
                    Blood lactate testing &amp; threshold analytics for endurance athletes and coaches.
                  </p>
                  <p style="margin: 0; font-size: 12.5px; line-height: 1.6;">
                    <a href="${CLIENT_URL}" style="color: ${BRAND.primary}; text-decoration: none; font-weight: 600;">lachart.net</a>
                    <span style="color: ${BRAND.border};">&nbsp;·&nbsp;</span>
                    <a href="${CLIENT_URL}/lactate-curve-calculator" style="color: ${BRAND.primary}; text-decoration: none;">Free calculator</a>
                    <span style="color: ${BRAND.border};">&nbsp;·&nbsp;</span>
                    <a href="${CLIENT_URL}/lactate-guide" style="color: ${BRAND.primary}; text-decoration: none;">Lactate guide</a>
                    <span style="color: ${BRAND.border};">&nbsp;·&nbsp;</span>
                    <a href="mailto:jakub@lachart.net" style="color: ${BRAND.primary}; text-decoration: none;">Support</a>
                  </p>
                  <p style="margin: 12px 0 0; color: ${BRAND.textMuted}; font-size: 11.5px; line-height: 1.5;">
                    If you did not expect this email, you can safely ignore it.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- /outer card -->

    </td>
  </tr>
</table>

</body>
</html>`;
}

/**
 * Get the client URL (always https://lachart.net for emails).
 * Kept identical to the previous implementation so existing callers that
 * compose absolute URLs continue to work without changes.
 */
function getClientUrl() {
  const envUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL;
  if (envUrl && (envUrl.includes('lachart.net') || envUrl.includes('https://'))) {
    return envUrl;
  }
  return 'https://lachart.net';
}

module.exports = {
  generateEmailTemplate,
  getClientUrl,
  // Exported for unit tests / preview tooling.
  BRAND,
};
