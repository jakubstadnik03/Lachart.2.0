import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invitationInfo, setInvitationInfo] = useState(null); // { email, name, needsRegistration }

  // Registration form state (only for new users)
  const [form, setForm] = useState({ name: '', surname: '', password: '', confirm: '' });
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    const verifyInvitation = async () => {
      try {
        const res = await api.get(`/user/verify-invitation-token/${token}`);
        setInvitationInfo(res.data);
        setLoading(false);
      } catch (err) {
        setError(err.response?.data?.error || 'This invitation link is invalid or has expired.');
        setLoading(false);
      }
    };
    verifyInvitation();
  }, [token]);

  // Existing user — just accept and go to dashboard
  const handleAcceptInvitation = async () => {
    try {
      setSubmitting(true);
      await api.post(`/user/accept-invitation/${token}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error accepting invitation. Please try again.');
      setSubmitting(false);
    }
  };

  // New user — complete registration and log in
  const handleRegister = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.surname.trim()) return setFormError('Please enter your name and surname.');
    if (form.password.length < 6) return setFormError('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setFormError('Passwords do not match.');

    try {
      setSubmitting(true);
      const res = await api.post(`/user/complete-registration/${token}`, {
        name: form.name.trim(),
        surname: form.surname.trim(),
        password: form.password,
      });
      // Log the user in with the returned JWT (token + user bypasses password login)
      if (res.data.token && login) {
        await login(null, null, res.data.token, res.data.user);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || 'Registration failed. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center text-slate-100">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-400 mx-auto" />
          <p className="mt-4 text-sm text-slate-300">Checking your invitation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="max-w-md w-full">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-[0.16em] text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Team Invitation
          </div>
        </div>

        <div className="bg-slate-950/70 border border-white/10 shadow-[0_18px_45px_rgba(15,23,42,0.74)] rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl">
          {error ? (
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-white text-center">Invitation problem</h1>
              <p className="mt-3 text-sm text-slate-300 text-center">{error}</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button onClick={() => navigate('/login')} className="w-full inline-flex justify-center items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-50 hover:bg-white/10 transition-colors">Go to login</button>
                <button onClick={() => navigate('/')} className="w-full inline-flex justify-center items-center rounded-xl border border-transparent bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 hover:bg-white transition-colors">Back to homepage</button>
              </div>
            </>
          ) : invitationInfo?.needsRegistration ? (
            /* ── NEW USER: registration form ── */
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-white text-center">Create your LaChart account</h1>
              <p className="mt-2 text-sm text-slate-400 text-center">
                You've been invited to join a coach's team. Fill in your details to get started.
              </p>
              {invitationInfo.email && (
                <div className="mt-3 text-center">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-slate-300">{invitationInfo.email}</span>
                </div>
              )}

              <div className="mt-5 rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-slate-900/40 to-sky-400/10 px-4 py-3 text-xs text-slate-200">
                <p className="font-medium text-slate-50">What happens when you register?</p>
                <ul className="mt-2 space-y-1.5 list-disc list-inside text-[11px] text-slate-200/90">
                  <li>Your free LaChart account is created instantly.</li>
                  <li>You are automatically connected to your coach.</li>
                  <li>You stay in full control — disconnect anytime in settings.</li>
                </ul>
              </div>

              <form onSubmit={handleRegister} className="mt-6 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">First name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      placeholder="Jan"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Surname</label>
                    <input
                      type="text"
                      required
                      value={form.surname}
                      onChange={e => setForm(p => ({ ...p, surname: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      placeholder="Novák"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    placeholder="At least 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Confirm password</label>
                  <input
                    type="password"
                    required
                    value={form.confirm}
                    onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    placeholder="Repeat password"
                  />
                </div>
                {formError && <p className="text-xs text-red-400 text-center">{formError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-2 inline-flex justify-center items-center rounded-xl border border-transparent bg-gradient-to-r from-violet-500 to-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-violet-500/30 hover:from-violet-400 hover:to-sky-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Creating account…' : 'Create account & join team'}
                </button>
              </form>
            </>
          ) : (
            /* ── EXISTING USER: just accept ── */
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-white text-center">Join your coach in LaChart</h1>
              <p className="mt-3 text-sm text-slate-300 text-center">
                You have been invited to connect your LaChart account with your coach.
                This allows them to see your tests, trainings and progress in one place.
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-slate-900/40 to-sky-400/10 px-4 py-3 text-xs text-slate-200">
                <p className="font-medium text-slate-50">What happens when you accept?</p>
                <ul className="mt-2 space-y-1.5 list-disc list-inside text-[11px] text-slate-200/90">
                  <li>Your coach gets access to your LaChart tests and trainings.</li>
                  <li>You stay in full control – you can disconnect later in settings.</li>
                  <li>Your current data and future uploads will be visible to the coach.</li>
                </ul>
              </div>

              <div className="mt-7 space-y-3">
                <button
                  onClick={handleAcceptInvitation}
                  disabled={submitting}
                  className="w-full inline-flex justify-center items-center rounded-xl border border-transparent bg-gradient-to-r from-violet-500 to-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-violet-500/30 hover:from-violet-400 hover:to-sky-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Accepting…' : 'Accept invitation'}
                </button>
                <button onClick={() => navigate('/dashboard')} className="w-full inline-flex justify-center items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors">
                  Maybe later
                </button>
              </div>

              <p className="mt-4 text-[11px] text-center text-slate-400">
                If you did not expect this invitation, you can safely ignore this page.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-[10px] text-center text-slate-500">LaChart · Smart lactate testing & training analytics</p>
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
