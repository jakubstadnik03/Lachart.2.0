/**
 * Put a generated PDF in front of the user, on whatever platform they are on.
 *
 * The web answer — open the blob URL in a new tab — is not available inside the
 * iOS app. WKWebView returns null from window.open for a blob: URL, and WebKit
 * has blocked top-level navigation to data: URLs for years, so the old
 * "window.open then document.write an <embed>" dance failed twice and then went
 * quiet: the button simply did nothing.
 *
 * What does work in that web view is the Web Share API with a file attached,
 * which hands the PDF to iOS itself — the sheet previews it and offers Books,
 * Files, Mail, AirDrop. Same route the activity share sheet already takes for
 * images, for the same reason.
 */

/** True when the platform can hand a file to the OS rather than to a tab. */
export function canShareFiles(file, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!file || !nav) return false;
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return Boolean(nav.canShare({ files: [file] }));
  } catch {
    // Safari throws rather than returning false for unsupported payloads.
    return false;
  }
}

export function makePdfFile(blob, fileName = 'report.pdf') {
  if (!blob) return null;
  try {
    return new File([blob], fileName, { type: 'application/pdf' });
  } catch {
    return null; // File constructor missing (older WebView) — fall through to a tab.
  }
}

/**
 * @returns {Promise<'shared'|'opened'|'downloaded'>} what actually happened, so
 *   the caller can word its status message truthfully.
 * @throws {Error} with name 'AbortError' when the user dismisses the OS sheet.
 */
export async function openPdfBlob(blob, fileName = 'report.pdf', opts = {}) {
  const nav = opts.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const win = opts.window || (typeof window !== 'undefined' ? window : null);
  const doc = opts.document || (typeof document !== 'undefined' ? document : null);
  if (!blob) throw new Error('No PDF to open.');

  const file = makePdfFile(blob, fileName);
  if (canShareFiles(file, nav)) {
    // No await before this point on purpose: iOS only allows share() while the
    // tap that triggered it is still counted as user activation.
    await nav.share({ files: [file], title: opts.title || 'LaChart Report' });
    return 'shared';
  }

  const url = opts.url || (win?.URL || URL).createObjectURL(blob);
  const tab = win?.open?.(url, '_blank', 'noopener');
  if (tab) return 'opened';

  // Pop-up blocked: save it instead of leaving the user with a dead button.
  if (doc?.createElement) {
    const link = doc.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    doc.body?.appendChild(link);
    link.click();
    link.remove();
    return 'downloaded';
  }
  throw new Error('Could not open the PDF on this device.');
}

export default openPdfBlob;
