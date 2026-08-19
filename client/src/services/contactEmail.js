/**
 * Sending a message from inside the app to the LaChart inbox, via EmailJS.
 *
 * The service and template ids were already hardcoded in three components
 * (FeedbackWidget, WelcomeModal, ContactUs). This is the fourth place that
 * needs them, so they live here now — one place to change when the template
 * changes, instead of four to remember.
 *
 * The public key is meant to be in the client bundle; that is what EmailJS
 * calls it. The private key must never appear here.
 */
import emailjs from '@emailjs/browser';

export const EMAILJS_SERVICE_ID = 'service_sdkyhzd';
export const EMAILJS_TEMPLATE_ID = 'template_wphmbwc';
export const EMAILJS_PUBLIC_KEY = 'ChzwROYrWPZuGCms-';

/**
 * Fill the template's own variables: {{name}}, {{email}}, {{phone}},
 * {{message}} and {{reply_to}}. Anything the template has no slot for — which
 * page the question came from, who was signed in — is appended to the message,
 * because a variable the template does not render is a variable nobody reads.
 *
 * @param {{message: string, email?: string, name?: string, page?: string,
 *          subject?: string}} input
 * @returns {{name: string, email: string, reply_to: string, phone: string,
 *            message: string, to_name: string}}
 */
export function buildTemplateParams({ message, email, name, page, subject } = {}) {
  const from = String(name || '').trim();
  const address = String(email || '').trim();
  const context = [
    subject ? `Subject: ${subject}` : null,
    page ? `Page: ${page}` : null,
    address ? `Reply to: ${address}` : null,
  ].filter(Boolean).join('\n');

  return {
    name: from || 'LaChart user',
    email: address || 'no address given',
    reply_to: address || '',
    phone: '',
    to_name: 'LaChart',
    message: context ? `${String(message || '').trim()}\n\n—\n${context}` : String(message || '').trim(),
  };
}

/**
 * @throws whatever EmailJS throws — the caller shows the error, since a
 *   silently dropped question is worse than a visible failure.
 */
export async function sendContactEmail(input) {
  const params = buildTemplateParams(input);
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, {
    publicKey: EMAILJS_PUBLIC_KEY,
  });
}

export default sendContactEmail;
