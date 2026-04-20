import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlusIcon, BeakerIcon, ClockIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import { getAthleteAvatar } from '../../utils/avatarUtils';

const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;

function getStatus(lastTestDate) {
  if (!lastTestDate) return 'red';
  const diff = Date.now() - new Date(lastTestDate).getTime();
  if (diff < SIX_WEEKS_MS) return 'green';
  if (diff < TWELVE_WEEKS_MS) return 'yellow';
  return 'red';
}

function fmtRelative(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return `${Math.floor(weeks / 4)}mo ago`;
}

const STATUS_COLORS = {
  green: { dot: 'bg-green-400', ring: 'ring-green-300', badge: 'bg-green-100 text-green-700', label: 'Active' },
  yellow: { dot: 'bg-yellow-400', ring: 'ring-yellow-300', badge: 'bg-yellow-100 text-yellow-700', label: 'Due soon' },
  red: { dot: 'bg-red-400', ring: 'ring-red-200', badge: 'bg-red-50 text-red-600', label: 'Overdue' },
};

const SPORT_EMOJI = { cycling: '🚴', running: '🏃', swimming: '🏊', triathlon: '🏅' };

/**
 * CoachDashboardHeader
 * Shows at the top of the Dashboard when user is a coach.
 * - Scrollable row of athlete avatar "chips" with status dots
 * - When an athlete is selected: expanded info card
 * - Summary counters: total / needs testing / recent test
 *
 * Props:
 *   selectedAthleteId — string | null
 *   onSelectAthlete   — (id: string) => void
 *   user              — auth user
 */
export default function CoachDashboardHeader({ selectedAthleteId, onSelectAthlete, user }) {
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [statuses, setStatuses] = useState({}); // athleteId → { lastTestDate, status }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/user/coach/athletes');
      const list = res.data || [];
      setAthletes(list);

      // Load test dates for all athletes in background
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
              const sorted = [...tests].sort((a, b) =>
                new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
              );
              const lastTestDate = sorted[0]?.date || sorted[0]?.createdAt || null;
              newStatuses[id] = { lastTestDate, status: getStatus(lastTestDate) };
            }
          });
          setStatuses(newStatuses);
        }).catch(() => {});
      }
    } catch (e) {
      console.error('CoachDashboardHeader: failed to load athletes', e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const activeAthletes = athletes.filter(
    a => !(a.invitationPending || a.coachLinkStatus === 'pending')
  );
  const pendingAthletes = athletes.filter(
    a => a.invitationPending || a.coachLinkStatus === 'pending'
  );
  const needsTestingCount = activeAthletes.filter(
    a => statuses[a._id] && statuses[a._id].status !== 'green'
  ).length;

  const selectedAthlete = activeAthletes.find(a => String(a._id) === String(selectedAthleteId));
  const selectedStatus = selectedAthlete ? statuses[selectedAthlete._id] : null;

  const isViewingSelf = String(selectedAthleteId) === String(user?._id);

  if (loading && athletes.length === 0) {
    return (
      <div className="flex items-center gap-3 mb-4 px-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (athletes.length === 0) {
    return (
      <div className="mb-5 flex items-center justify-between bg-white rounded-2xl border border-dashed border-gray-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">No athletes yet</p>
          <p className="text-xs text-gray-400 mt-0.5">Add athletes to start coaching</p>
        </div>
        <button
          onClick={() => navigate('/athletes')}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-medium rounded-xl shadow-sm hover:bg-primary-dark transition-colors"
        >
          <UserPlusIcon className="w-4 h-4" />
          Add Athlete
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-3">
      {/* Summary chips row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Stat chips */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-xs text-gray-600">
          <span className="font-semibold text-gray-800">{activeAthletes.length}</span> athletes
        </div>
        {needsTestingCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-xs text-red-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            {needsTestingCount} need{needsTestingCount === 1 ? 's' : ''} testing
          </div>
        )}
        {pendingAthletes.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-xs text-amber-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {pendingAthletes.length} pending
          </div>
        )}
        <button
          onClick={() => navigate('/athletes')}
          className="ml-auto text-xs text-gray-400 hover:text-primary transition-colors"
        >
          Manage →
        </button>
      </div>

      {/* Athlete avatar chips — horizontal scroll */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {/* "View own dashboard" chip */}
        <button
          onClick={() => onSelectAthlete(user?._id)}
          title="My overview"
          className={`flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            isViewingSelf
              ? 'bg-primary/10 ring-2 ring-primary/30'
              : 'hover:bg-gray-100'
          }`}
        >
          <div className="relative">
            <img
              src={user?.profileImage || '/images/triathlete-avatar.jpg'}
              alt="Me"
              className="w-9 h-9 rounded-full object-cover"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-white text-[6px] flex items-center justify-center text-white font-bold">me</span>
          </div>
          <span className={`text-[9px] font-medium truncate max-w-[3rem] ${isViewingSelf ? 'text-primary' : 'text-gray-500'}`}>
            Me
          </span>
        </button>

        <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

        {activeAthletes.map(athlete => {
          const st = statuses[athlete._id];
          const statusKey = st?.status || 'red';
          const colors = STATUS_COLORS[statusKey];
          const isSelected = String(selectedAthleteId) === String(athlete._id);

          return (
            <button
              key={athlete._id}
              onClick={() => onSelectAthlete(athlete._id)}
              title={`${athlete.name} ${athlete.surname}${st?.lastTestDate ? ` · Last test: ${fmtRelative(st.lastTestDate)}` : ' · No test data'}`}
              className={`flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
                isSelected
                  ? `bg-violet-50 ring-2 ${colors.ring}`
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="relative">
                <img
                  src={getAthleteAvatar(athlete)}
                  alt={athlete.name}
                  className={`w-9 h-9 rounded-full object-cover transition-all ${isSelected ? 'ring-2 ring-violet-400' : ''}`}
                />
                {/* Status dot */}
                {st !== undefined && (
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${colors.dot}`} />
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
          className="flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors">
            <UserPlusIcon className="w-4 h-4" />
          </div>
          <span className="text-[9px] text-gray-400">Add</span>
        </button>
      </div>

      {/* Selected athlete detail card */}
      {selectedAthlete && !isViewingSelf && (
        <div className="bg-white rounded-2xl border border-violet-100 px-4 py-3 flex items-center gap-4 shadow-sm">
          <img
            src={getAthleteAvatar(selectedAthlete)}
            alt={selectedAthlete.name}
            className="w-11 h-11 rounded-full border-2 border-violet-200 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">
                {selectedAthlete.name} {selectedAthlete.surname}
              </span>
              {selectedAthlete.sport && (
                <span className="text-xs">
                  {SPORT_EMOJI[selectedAthlete.sport?.toLowerCase()] || '🏅'} {selectedAthlete.sport}
                </span>
              )}
              {selectedStatus && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[selectedStatus.status].badge}`}>
                  {STATUS_COLORS[selectedStatus.status].label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {selectedStatus?.lastTestDate ? (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <BeakerIcon className="w-3 h-3" />
                  Last test: {fmtRelative(selectedStatus.lastTestDate)}
                </span>
              ) : (
                <span className="text-xs text-gray-400">No test data yet</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(`/testing/${selectedAthlete._id}`)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <BeakerIcon className="w-3.5 h-3.5" />
              Tests
            </button>
            <button
              onClick={() => navigate(`/athlete/${selectedAthlete._id}`)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              Profile →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
