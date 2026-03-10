import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invitationValid, setInvitationValid] = useState(false);

  useEffect(() => {
    const verifyInvitation = async () => {
      try {
        await api.get(`/user/verify-invitation-token/${token}`);
        setInvitationValid(true);
        setLoading(false);
      } catch (error) {
        setError(error.response?.data?.error || 'This invitation link is invalid or has expired.');
        setLoading(false);
      }
    };

    verifyInvitation();
  }, [token]);

  const handleAcceptInvitation = async () => {
    try {
      setLoading(true);
      await api.post(`/user/accept-invitation/${token}`);
      setLoading(false);
      navigate('/dashboard');
    } catch (error) {
      setError(error.response?.data?.error || 'Error accepting invitation. Please try again.');
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    navigate('/login');
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
              <h1 className="text-xl sm:text-2xl font-semibold text-white text-center">
                Invitation problem
              </h1>
              <p className="mt-3 text-sm text-slate-300 text-center">
                {error}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleGoToLogin}
                  className="w-full inline-flex justify-center items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-50 hover:bg-white/10 transition-colors"
                >
                  Go to login
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full inline-flex justify-center items-center rounded-xl border border-transparent bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900 hover:bg-white transition-colors"
                >
                  Back to homepage
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-white text-center">
                Join your coach in LaChart
              </h1>
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
                  disabled={!invitationValid || loading}
                  className="w-full inline-flex justify-center items-center rounded-xl border border-transparent bg-gradient-to-r from-violet-500 to-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-violet-500/30 hover:from-violet-400 hover:to-sky-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Accepting…' : 'Accept invitation'}
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full inline-flex justify-center items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors"
                >
                  Maybe later
                </button>
              </div>

              <p className="mt-4 text-[11px] text-center text-slate-400">
                If you did not expect this invitation, you can safely ignore this page.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-[10px] text-center text-slate-500">
          LaChart · Smart lactate testing & training analytics
        </p>
      </div>
    </div>
  );
};

export default AcceptInvitationPage;