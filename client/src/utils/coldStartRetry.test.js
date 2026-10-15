import { fetchWithColdStartRetry, isRetryableAuthPath, isColdStartStatus } from './coldStartRetry';

// The bug these tests exist for: a sleeping Render instance answers the first
// request with a gateway 502 that has no CORS header, so clicking "Sign in
// with Google" on a cold site failed with what looked like a CORS error and
// left the button dead. Retrying is only correct when our app never saw the
// request — never when it answered.

const response = (status) => ({ status, ok: status >= 200 && status < 300 });

describe('isRetryableAuthPath', () => {
  it('covers the social sign-in POSTs', () => {
    expect(isRetryableAuthPath('https://api.example/user/google-auth')).toBe(true);
    expect(isRetryableAuthPath('/user/apple-auth')).toBe(true);
  });

  it('does not cover anything else', () => {
    expect(isRetryableAuthPath('/user/edit-profile')).toBe(false);
    expect(isRetryableAuthPath(undefined)).toBe(false);
  });
});

describe('isColdStartStatus', () => {
  it('is the gateway codes only', () => {
    expect([502, 503, 504].every(isColdStartStatus)).toBe(true);
    // A 429 or a 401 is our app answering. Repeating those is wrong.
    expect(isColdStartStatus(429)).toBe(false);
    expect(isColdStartStatus(401)).toBe(false);
    expect(isColdStartStatus(200)).toBe(false);
  });
});

describe('fetchWithColdStartRetry', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  // Advance through every pending timer as the retries schedule them.
  const settle = async (promise) => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
      await Promise.resolve();
      jest.runOnlyPendingTimers();
    }
    return promise;
  };

  it('returns a successful response without retrying', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200));
    global.fetch = fetchMock;
    const res = await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries past a gateway 502 and returns the eventual success', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValue(response(200));
    global.fetch = fetchMock;
    const res = await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a thrown network error', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(response(200));
    global.fetch = fetchMock;
    const res = await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a request our app answered', async () => {
    // A 401 on a bad token, or a 429 from the limiter, ran on the server.
    // Sending the credential again would be pointless at best.
    const fetchMock = jest.fn().mockResolvedValue(response(401));
    global.fetch = fetchMock;
    const res = await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports progress so the UI can say the server is waking up', async () => {
    const onRetry = jest.fn();
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValue(response(200));
    await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }, onRetry));
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('gives up after the last wait and surfaces the failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(502));
    global.fetch = fetchMock;
    const res = await settle(fetchWithColdStartRetry('/user/google-auth', { method: 'POST' }));
    expect(res.status).toBe(502);
    // Four waits, so five attempts in all.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
