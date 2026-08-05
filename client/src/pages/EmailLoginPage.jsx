import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';

/**
 * Landing point for one-click sign-in links in emails.
 *
 * The server puts the session token in the URL **fragment** so it never reaches
 * a server log or a Referer header. We consume it, wipe it from the address bar
 * immediately, then continue to whatever page the email promised.
 */
export default function EmailLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState(null);
  const ranRef = useRef(false); // StrictMode double-mount guard

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const frag = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        const token = frag.get('token');
        const next = frag.get('next') || '/settings?tab=subscription';
        if (!token) {
          setError('This sign-in link is incomplete.');
          return;
        }

        // Drop the token from the visible URL before anything else can capture it.
        window.history.replaceState({}, document.title, window.location.pathname);

        localStorage.setItem('token', token);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;

        const { data } = await api.get('/user/profile');
        await login(null, null, token, data);

        navigate(next.startsWith('/') ? next : '/settings?tab=subscription', { replace: true });
      } catch (e) {
        console.error('[EmailLogin]', e);
        setError('This sign-in link has expired. Please log in normally.');
      }
    })();
  }, [login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <div className="text-4xl mb-3">🔑</div>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Sign-in link problem</h1>
            <p className="text-sm text-gray-600 mb-5">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
            >
              Go to login
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 mx-auto mb-4 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}
