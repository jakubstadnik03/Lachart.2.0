import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import api from '../services/api';
import { getAthleteAvatar, getAvatarBySportAndGender } from '../utils/avatarUtils';

// Admin sees coach UI only when their role is not 'athlete'.
// An admin who set role='athlete' should see athlete UI, not coach UI.
const isCoachRole = (user) =>
  ['coach', 'tester', 'testing', 'admin'].includes(user?.role) ||
  (user?.admin === true && user?.role !== 'athlete');

const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;

function getStatus(lastTestDate) {
  if (!lastTestDate) return 'red';
  const diff = Date.now() - new Date(lastTestDate).getTime();
  if (diff < SIX_WEEKS_MS) return 'green';
  if (diff < TWELVE_WEEKS_MS) return 'yellow';
  return 'red';
}

const STATUS_DOT = {
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
};
const STATUS_RING = {
  green: 'ring-green-300',
  yellow: 'ring-yellow-300',
  red: 'ring-red-200',
};

/**
 * CoachAthleteBar
 * Global coach athlete picker — visible on every page for coach/tester roles.
 * Shows a horizontal scrollable row of athlete avatar chips + "Manage" link.
 * Selecting an athlete navigates to the current section with the new athlete ID.
 */
export default function CoachAthleteBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isCoach = isCoachRole(user);

  // ── Single source of truth — read from global context ────────────────────────
  const { selectedAthleteId, setSelectedAthleteId } = useAthleteSelection();

  // When the URL has an explicit athlete ID (e.g. direct navigation / deep link),
  // push it into the context so all pages stay in sync.
  useEffect(() => {
    const seg = location.pathname.split('/')[2];
    if (seg && /^[a-f0-9]{24}$/.test(seg) && seg !== selectedAthleteId) {
      setSelectedAthleteId(seg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const [athletes, setAthletes] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isCoach) return;
    try {
      setLoading(true);
      const res = await api.get('/user/coach/athletes');
      const list = res.data || [];
      setAthletes(list);
      // Load test statuses in background
      if (list.length > 0) {
        Promise.allSettled(
          list.slice(0, 20).map(a =>
            api.get(`/test/list/${a._id}`).then(r => ({ id: a._id, tests: r.data || [] }))
          )
        ).then(results => {
          const newStatuses = {};
          results.forEach(r => {
            if (r.status === 'fulfilled') {
              const { id, tests } = r.value;
              const sorted = [...tests].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
              const lastTestDate = sorted[0]?.date || sorted[0]?.createdAt || null;
              newStatuses[id] = { lastTestDate, status: getStatus(lastTestDate) };
            }
          });
          setStatuses(newStatuses);
        }).catch(() => {});
      }
    } catch (e) {
      console.error('CoachAthleteBar: failed to load athletes', e);
    } finally {
      setLoading(false);
    }
  }, [isCoach]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener('coachAthletesUpdated', handler);
    window.addEventListener('athleteListUpdated', handler);
    return () => {
      window.removeEventListener('coachAthletesUpdated', handler);
      window.removeEventListener('athleteListUpdated', handler);
    };
  }, [load]);

  if (!isCoach) return null;

  // Pages that use /:section/:athleteId URL pattern
  const ATHLETE_URL_SECTIONS = ['dashboard', 'training', 'testing', 'athlete'];
  const currentSection = location.pathname.split('/')[1];

  const handleSelectAthlete = (athleteId) => {
    // setSelectedAthleteId writes to localStorage + broadcasts the event automatically.
    setSelectedAthleteId(athleteId);
    if (ATHLETE_URL_SECTIONS.includes(currentSection)) {
      navigate(`/${currentSection}/${athleteId}`, { replace: true });
    }
    // For pages like training-calendar — they listen to globalAthleteChanged (broadcast by context).
  };

  const activeAthletes = athletes.filter(a => !(a.invitationPending || a.coachLinkStatus === 'pending'));
  const pendingCount = athletes.filter(a => a.invitationPending || a.coachLinkStatus === 'pending').length;
  const needsTestingCount = activeAthletes.filter(a => statuses[a._id] && statuses[a._id].status !== 'green').length;
  const isViewingSelf = String(selectedAthleteId) === String(user?._id);

  if (loading && athletes.length === 0) {
    return (
      <div className="shrink-0 border-b border-gray-100 bg-white px-3 sm:px-4 py-2 flex items-center gap-2 mt-[calc(env(safe-area-inset-top,0px)+3.5rem)] lg:mt-0">
        {[1, 2, 3].map(i => <div key={i} className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-sm px-3 sm:px-4 py-2 space-y-1.5 mt-[calc(env(safe-area-inset-top,0px)+3.5rem)] lg:mt-0">
      {/* Top row: stats + manage */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">
          <span className="text-gray-800">{activeAthletes.length}</span> athletes
        </span>
        {needsTestingCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            {needsTestingCount} need testing
          </span>
        )}
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100">
            {pendingCount} pending
          </span>
        )}
        <button onClick={() => navigate('/athletes')} className="ml-auto text-xs text-gray-400 hover:text-primary transition-colors font-medium">
          Manage →
        </button>
      </div>

      {/* Avatar chips row */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
        {/* "Me" chip — coach's own profile */}
        <button
          onClick={() => {
            setSelectedAthleteId(user?._id);
            // Always navigate somewhere useful:
            // • on athlete-section pages → stay in section, swap ID
            // • everywhere else → go to own athlete profile
            if (ATHLETE_URL_SECTIONS.includes(currentSection)) {
              navigate(`/${currentSection}/${user?._id}`, { replace: true });
            } else {
              navigate(`/athlete/${user?._id}`);
            }
          }}
          title="Open my profile"
          className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            isViewingSelf
              ? 'bg-primary/10 ring-2 ring-primary/30'
              : 'hover:bg-gray-100'
          }`}
        >
          <div className="relative">
            <img
              src={getAvatarBySportAndGender(user)}
              alt="Me"
              className={`w-9 h-9 rounded-full object-cover border-2 ${
                isViewingSelf ? 'border-primary' : 'border-transparent'
              }`}
              onError={e => { e.currentTarget.src = '/images/coach-avatar.webp'; }}
            />
            {/* "Me" badge */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary border-2 border-white flex items-center justify-center">
              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          <span className={`text-[9px] font-semibold truncate max-w-[3.5rem] ${isViewingSelf ? 'text-primary' : 'text-gray-600'}`}>
            {user?.name || 'Me'}
          </span>
        </button>

        <div className="w-px h-7 bg-gray-200 flex-shrink-0" />

        {activeAthletes.map(athlete => {
          const st = statuses[athlete._id];
          const statusKey = st?.status || 'red';
          const isSelected = String(selectedAthleteId) === String(athlete._id);
          return (
            <button
              key={athlete._id}
              onClick={() => handleSelectAthlete(athlete._id)}
              title={`${athlete.name} ${athlete.surname}${st?.lastTestDate ? '' : ' · No test data'}`}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl transition-all ${
                isSelected ? `bg-violet-50 ring-2 ${STATUS_RING[statusKey]}` : 'hover:bg-gray-50'
              }`}
            >
              <div className="relative">
                <img
                  src={getAthleteAvatar(athlete)}
                  alt={athlete.name}
                  className={`w-8 h-8 rounded-full object-cover ${isSelected ? 'ring-2 ring-violet-400' : ''}`}
                />
                {st !== undefined && (
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${STATUS_DOT[statusKey]}`} />
                )}
              </div>
              <span className={`text-[9px] font-medium truncate max-w-[3.5rem] ${isSelected ? 'text-violet-700' : 'text-gray-500'}`}>
                {athlete.name}
              </span>
            </button>
          );
        })}

        {/* Add athlete button */}
        <button
          onClick={() => navigate('/athletes')}
          title="Add athlete"
          className="flex-shrink-0 flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors">
            <UserPlusIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[9px] text-gray-400">Add</span>
        </button>
      </div>
    </div>
  );
}
