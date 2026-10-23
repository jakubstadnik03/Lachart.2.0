import { submitPasswordReset, validateNewPassword, RESET_LINK_INVALID } from './passwordReset';

const base = { apiBaseUrl: 'https://api.test', token: 'tok123', password: 'longenough', confirmPassword: 'longenough' };

describe('submitPasswordReset', () => {
  it('posts the token and new password to the reset endpoint', async () => {
    const post = jest.fn().mockResolvedValue({ data: {} });
    const result = await submitPasswordReset(base, post);
    expect(post).toHaveBeenCalledWith('https://api.test/user/reset-password', { token: 'tok123', newPassword: 'longenough' });
    expect(result.type).toBe('success');
  });

  it('does not claim success when the server rejects the link', async () => {
    const post = jest.fn().mockRejectedValue({ response: { status: 400, data: { error: 'Neplatný token' } } });
    const result = await submitPasswordReset(base, post);
    expect(result).toEqual({ type: 'error', message: RESET_LINK_INVALID });
  });

  it('treats the 500 an expired JWT produces as an invalid link', async () => {
    const post = jest.fn().mockRejectedValue({ response: { status: 500, data: {} } });
    expect((await submitPasswordReset(base, post)).message).toBe(RESET_LINK_INVALID);
  });

  it('reports a network failure separately', async () => {
    const post = jest.fn().mockRejectedValue(new Error('Network Error'));
    const result = await submitPasswordReset(base, post);
    expect(result.type).toBe('error');
    expect(result.message).toMatch(/server/i);
  });

  it('checks length and confirmation before sending anything', async () => {
    const post = jest.fn();
    expect((await submitPasswordReset({ ...base, password: 'short', confirmPassword: 'short' }, post)).type).toBe('error');
    expect((await submitPasswordReset({ ...base, confirmPassword: 'different1' }, post)).type).toBe('error');
    expect((await submitPasswordReset({ ...base, token: undefined }, post)).message).toBe(RESET_LINK_INVALID);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('validateNewPassword', () => {
  it('requires 8 characters like the server', () => {
    expect(validateNewPassword('1234567', '1234567')).not.toBe('');
    expect(validateNewPassword('12345678', '12345678')).toBe('');
  });
});
