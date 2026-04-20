import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import { getAthleteAvatar } from '../utils/avatarUtils';

const COACH_ROLES = ['coach', 'tester', 'testing'];

/**
 * CoachAthleteBar
 * Shown when a coach has selected an athlete (other than themselves).
 * Sticky banner between Header and main content.
 */
export default function CoachAthleteBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [athlete, setAthlete] = useState(null);
  const [allAthletes, setAllAthletes] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isCoach = COACH_ROLES.includes(user?.role);

  // Determine selected athlete ID (URL takes priority, then localStorage)
  const urlAthleteId = location.pathname.split('/')[2];
  const storedAthleteId = (() => {
    try { return localStorage.getItem('global_selectedAthleteId'); } catch { return null; }
  })();
  const selectedAthleteId = urlAthleteId || storedAthleteId;

  // Only show if coach and selected athlete is different from themselves
  const shouldShow = isCoach && selectedAthleteId && selectedAthleteId !== user?._id;

  // Load selected athlete info
  useEffect(() => {
    if (!shouldShow || !selectedAthleteId) {
      setAthlete(null);
      return;
    }
    let cancelled = false;
    api.get(`/user/athlete/${selectedAthleteId}`)
      .then(res => { if (!cancelled) setAthlete(res.data); })
      .catch(() => { if (!cancelled) setAthlete(null); });
    return () => { cancelled = true; };
  }, [selectedAthleteId, shouldShow]);

  // Load all athletes for the switcher dropdown
  useEffect(() => {
    if (!isCoach) return;
    api.get('/user/coach/athletes')
      .then(res => setAllAthletes(res.data || []))
      .catch(() => {});
  }, [isCoach]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!shouldShow || !athlete) return null;

  const currentPath = location.pathname.split('/')[1];

  const handleSwitchAthlete = (athleteId) => {
    setDropdownOpen(false);
    try { localStorage.setItem('global_selectedAthleteId', athleteId); } catch {}
    navigate(`/${currentPath}/${athleteId}`, { replace: true });
  };

  const handleExit = () => {
    try { localStorage.removeItem('global_selectedAthleteId'); } catch {}
    navigate('/athletes', { replace: true });
  };

  const statusAge = athlete?.lastTestDate
    ? Math.floor((Date.now() - new Date(athlete.lastTestDate)) / (1000 * 60 * 60 * 24 * 7))
    : null;

  const statusColor = statusAge === null ? 'bg-gray-300'
    : statusAge < 6 ? 'bg-green-400'
    : statusAge < 12 ? 'bg-yellow-400'
    : 'bg-red-400';

  return (
    <div className="shrink-0 z-20 bg-violet-50 border-b border-violet-200 px-3 sm:px-4 py-2 flex items-center gap-3">
      {/* Avatar + Name */}
      <div ref={dropdownRef} className="relative flex items-center gap-2 min-w-0 flex-1">
        <img
          src={getAthleteAvatar(athlete)}
          alt=""
          className="w-7 h-7 rounded-full border-2 border-violet-300 shrink-0"
        />
        <button
          onClick={() => setDropdownOpen(v => !v)}
          className="flex items-center gap-1 min-w-0 group"
        >
          <span className="text-xs font-semibold text-violet-800 truncate">
            {athlete.name} {athlete.surname}
          </span>
          {athlete.sport && (
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-violet-200 text-violet-700 rounded-full font-medium shrink-0">
              {athlete.sport}
            </span>
          )}
          <ChevronDownIcon className={`w-3 h-3 text-violet-500 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        <span className="hidden sm:flex items-center gap-1 text-[10px] text-violet-500 ml-1 shrink-0">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          {statusAge === null ? 'no test data' : statusAge < 6 ? 'tested recently' : statusAge < 12 ? 'test due' : 'overdue'}
        </span>

        {/* Athlete switcher dropdown */}
        {dropdownOpen && allAthletes.length > 1 && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 max-h-60 overflow-y-auto">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Switch athlete</p>
            {allAthletes
              .filter(a => !(a.invitationPending || a.coachLinkStatus === 'pending'))
              .map(a => (
                <button
                  key={a._id}
                  onClick={() => handleSwitchAthlete(a._id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-violet-50 transition-colors ${
                    String(a._id) === String(selectedAthleteId) ? 'bg-violet-50 font-medium text-violet-700' : 'text-gray-700'
                  }`}
                >
                  <img src={getAthleteAvatar(a)} alt="" className="w-5 h-5 rounded-full" />
                  {a.name} {a.surname}
                </button>
              ))
            }
          </div>
        )}
      </div>

      {/* Label */}
      <span className="hidden md:block text-[10px] text-violet-400 font-medium shrink-0">
        Coach view
      </span>

      {/* Exit button */}
      <button
        onClick={handleExit}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium transition-colors shrink-0"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Exit</span>
      </button>
    </div>
  );
}
