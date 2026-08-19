/**
 * The EmailJS template renders {{name}}, {{email}}, {{phone}} and {{message}},
 * and replies go to {{reply_to}}. Anything we put anywhere else is invisible,
 * so these tests are mostly about what ends up inside those five slots.
 */
jest.mock('@emailjs/browser', () => ({ send: jest.fn().mockResolvedValue({ status: 200 }) }), { virtual: true });

// eslint-disable-next-line import/first
import emailjs from '@emailjs/browser';
// eslint-disable-next-line import/first
import {
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID,
  buildTemplateParams,
  sendContactEmail,
} from './contactEmail';

describe('buildTemplateParams', () => {
  it('carries the question itself', () => {
    const p = buildTemplateParams({ message: '  How do I add lactate?  ' });
    expect(p.message).toContain('How do I add lactate?');
    expect(p.message.startsWith(' ')).toBe(false);
  });

  it('puts the address where a reply will actually use it', () => {
    const p = buildTemplateParams({ message: 'q', email: 'jana@example.com' });
    expect(p.reply_to).toBe('jana@example.com');
    expect(p.email).toBe('jana@example.com');
  });

  it('says where the question came from, since the template has no slot for it', () => {
    const p = buildTemplateParams({ message: 'q', page: '/guide', subject: 'Question from the guide' });
    expect(p.message).toContain('/guide');
    expect(p.message).toContain('Question from the guide');
  });

  it('never sends an empty name into "New message from {{name}}"', () => {
    expect(buildTemplateParams({ message: 'q' }).name).toBe('LaChart user');
    expect(buildTemplateParams({ message: 'q', name: '  ' }).name).toBe('LaChart user');
    expect(buildTemplateParams({ message: 'q', name: 'Jana Nováková' }).name).toBe('Jana Nováková');
  });

  it('is explicit when nobody left an address', () => {
    const p = buildTemplateParams({ message: 'q' });
    expect(p.email).toBe('no address given');
    expect(p.reply_to).toBe('');
  });

  it('fills phone so the template does not print the raw variable', () => {
    expect(buildTemplateParams({ message: 'q' }).phone).toBe('');
  });
});

describe('sendContactEmail', () => {
  beforeEach(() => emailjs.send.mockClear());

  it('sends through the service and template the app already uses', async () => {
    await sendContactEmail({ message: 'q', email: 'a@b.cz', name: 'Jana', page: '/guide' });
    expect(emailjs.send).toHaveBeenCalledTimes(1);
    const [service, template, params, options] = emailjs.send.mock.calls[0];
    expect(service).toBe(EMAILJS_SERVICE_ID);
    expect(template).toBe(EMAILJS_TEMPLATE_ID);
    expect(options).toEqual({ publicKey: EMAILJS_PUBLIC_KEY });
    expect(params.reply_to).toBe('a@b.cz');
  });

  it('lets a failure reach the caller instead of swallowing the question', async () => {
    emailjs.send.mockRejectedValueOnce(new Error('network'));
    await expect(sendContactEmail({ message: 'q' })).rejects.toThrow('network');
  });

  it('ships only the public key', () => {
    // The private key belongs on the EmailJS dashboard, never in the bundle.
    expect(EMAILJS_PUBLIC_KEY).toBe('ChzwROYrWPZuGCms-');
    const source = require('fs').readFileSync(`${__dirname}/contactEmail.js`, 'utf8');
    expect(source).not.toMatch(/privateKey/i);
  });
});
