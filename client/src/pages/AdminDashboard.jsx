import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getEventStats } from '../utils/eventLogger';
import { getAdminUsers, getAdminStats, getAdminHealth, getCoachAthletesPage, updateUserAdmin, deleteUserAdmin, deleteAthleteWithTests, sendReactivationEmail, sendThankYouEmail, sendThankYouEmailToAll, sendFeatureAnnouncementEmail, sendStravaReminderEmail, sendAppDownloadEmail, sendCoachOutreachEmail, getCoachOutreachLeads, updateCoachOutreachLead, importCoachOutreachLeads, startBulkOutreachCampaign, stopBulkCampaign, listBulkCampaigns, getDefaultOutreachTemplate, impersonateUser, sendRetentionEmailPreview, fetchWhatsNewMay2026Status, sendWhatsNewMay2026Preview, runWhatsNewMay2026Campaign, resetWhatsNewMay2026, fetchIosLaunchJun2026Status, sendIosLaunchJun2026Preview, runIosLaunchJun2026Campaign, resetIosLaunchJun2026 } from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OUTREACH_CONTACTS, buildOutreachEmail, ALL_COUNTRIES } from '../data/outreachContacts';
import { PageSkeleton } from '../components/common/Skeleton';

function formatAdminHealthTime(value) {
  if (!value) return 'Never';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 'Unknown';
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthUserName(log) {
  const user = log?.userId;
  if (!user) return 'Unknown user';
  return [user.name, user.surname].filter(Boolean).join(' ') || user.email || String(user._id || 'Unknown user');
}

function mobileAppPlatformLabel(platform) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  return 'App';
}

function renderMobileAppBadge(user, { compact = false } = {}) {
  if (!user?.hasMobileApp) {
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 ${compact ? '' : 'w-fit'}`}>
        —
      </span>
    );
  }

  const platform = user.mobileAppPlatform;
  const label = mobileAppPlatformLabel(platform);
  const colorClass = platform === 'ios'
    ? 'bg-slate-800 text-white'
    : platform === 'android'
      ? 'bg-green-700 text-white'
      : 'bg-cyan-100 text-cyan-900';

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${colorClass} ${compact ? '' : 'w-fit'}`}>
      {label}
      {user.mobileAppVersion ? ` v${user.mobileAppVersion}` : ''}
    </span>
  );
}

const AdminDashboard = () => {
  const { user: currentUser, loading, login: authLogin } = useAuth();
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [adminHealth, setAdminHealth] = useState(null);
  const [eventStats, setEventStats] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stravaFilter, setStravaFilter] = useState('all'); // 'all', 'connected', 'notConnected'
  const [mobileAppFilter, setMobileAppFilter] = useState('all'); // 'all', 'hasApp', 'active7d', 'noApp'
  const [premiumFilter, setPremiumFilter] = useState('all'); // 'all' | 'free' | 'manual' | 'paid' | 'trial' | 'any'
  const [emailLoadingUserId, setEmailLoadingUserId] = useState(null);
  const [thankYouEmailLoadingUserId, setThankYouEmailLoadingUserId] = useState(null);
  const [featureAnnouncementEmailLoadingUserId, setFeatureAnnouncementEmailLoadingUserId] = useState(null);
  const [featureAnnouncementEmailType, setFeatureAnnouncementEmailType] = useState('newFeatures'); // 'newFeatures', 'googleLoginFix', 'improvements', 'tips', 'community', 'thresholdLogicUpdate'
  const [stravaReminderEmailLoadingUserId, setStravaReminderEmailLoadingUserId] = useState(null);
  const [appDownloadEmailLoadingUserId, setAppDownloadEmailLoadingUserId] = useState(null);
  const [sendingToAll, setSendingToAll] = useState(false);
  const [usersLimit, setUsersLimit] = useState(20);
  const [chartTimeRange, setChartTimeRange] = useState(30); // days
  const [chartGroupBy, setChartGroupBy] = useState('day'); // 'day' or 'week'
  const [marketingEmailType, setMarketingEmailType] = useState('thankYou'); // 'thankYou', 'reactivation', or 'featureAnnouncement'
  const [marketingFilter, setMarketingFilter] = useState('all'); // 'all', 'notSent', 'sent', 'recommended'
  const [marketingSearchQuery, setMarketingSearchQuery] = useState('');
  const [selectedUsersForBulk, setSelectedUsersForBulk] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [deleteLoadingUserId, setDeleteLoadingUserId] = useState(null);
  const [deleteAthleteLoadingId, setDeleteAthleteLoadingId] = useState(null);
  const [outreachName, setOutreachName] = useState('');
  const [outreachEmail, setOutreachEmail] = useState('');
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachLeads, setOutreachLeads] = useState([]);
  const [outreachLeadsLoading, setOutreachLeadsLoading] = useState(false);
  const [outreachLeadUpdatingId, setOutreachLeadUpdatingId] = useState(null);
  // Outreach contacts CRM
  // Default to the actionable list: contacts that have an email and haven't
  // been emailed yet. The admin can switch to 'all' / 'priority' / etc. via
  // the chip filters at the top of the Outreach panel.
  const [outreachFilter, setOutreachFilter] = useState('not-contacted'); // all | lab | coach | priority | email-only | not-contacted
  const [outreachCountry, setOutreachCountry] = useState('');
  const [outreachSearch, setOutreachSearch] = useState('');
  const [composeContact, setComposeContact] = useState(null); // contact being composed
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composePreviewSending, setComposePreviewSending] = useState(false);
  const [copiedContactId, setCopiedContactId] = useState(null);

  // ── Bulk outreach campaign state ─────────────────────────────────────────────
  const [csvImportFile, setCsvImportFile] = useState(null);
  const [csvImportPreview, setCsvImportPreview] = useState(null); // { leads, withEmail }
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState(null); // { inserted, skipped }
  const [bulkCampaigns, setBulkCampaigns] = useState([]);
  const [bulkCampaignsLoading, setBulkCampaignsLoading] = useState(false);
  const [bulkFilterTypes, setBulkFilterTypes] = useState([]);
  const [bulkFilterCountries, setBulkFilterCountries] = useState([]);
  const [bulkNotContacted, setBulkNotContacted] = useState(true);
  const [bulkOnlyWithEmail, setBulkOnlyWithEmail] = useState(true);
  const [bulkBatchSize, setBulkBatchSize] = useState(10);
  const [bulkInterval, setBulkInterval] = useState(120); // minutes
  const [bulkSubject, setBulkSubject] = useState('Free tool for lactate testing coaches - LaChart');
  const [bulkTemplate, setBulkTemplate] = useState('');
  const [bulkStarting, setBulkStarting] = useState(false);
  const [bulkCampaignError, setBulkCampaignError] = useState('');

  // ── Leads table state ────────────────────────────────────────────────────────
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsTypeFilter, setLeadsTypeFilter] = useState('');
  const [leadsShowContacted, setLeadsShowContacted] = useState(false);
  const [leadsPreviewingId, setLeadsPreviewingId] = useState(null); // leadId being previewed
  const [leadsSendingId, setLeadsSendingId] = useState(null);       // leadId being sent to

  // ── Retention email preview ──────────────────────────────────────────────────
  const [retentionSearch,    setRetentionSearch]    = useState('');
  const [retentionEmailType, setRetentionEmailType] = useState('weekly');
  const [retentionSending,   setRetentionSending]   = useState(null);
  const [retentionResult,    setRetentionResult]    = useState(null);

  // Lazy-loaded athletes lists inside coach cards (pagination).
  // Key: coachId, Value: { athletes: [], totalLinked: number, totalWithPassword: number }
  const [coachAthletesByCoachId, setCoachAthletesByCoachId] = useState({});
  const [coachAthletesLoadingByCoachId, setCoachAthletesLoadingByCoachId] = useState({});

  const handleImpersonate = async (user) => {
    if (!user?._id) return;
    try {
      const data = await impersonateUser(user._id);
      const { token, user: impersonatedUser } = data || {};
      if (!token || !impersonatedUser) {
        console.error('Impersonation response missing token or user');
        return;
      }
      // Reuse existing auth login flow so all caches and storage are handled consistently
      await authLogin(null, null, token, impersonatedUser);
    } catch (error) {
      console.error('Failed to impersonate user:', error);
      window.alert('Failed to impersonate user. Please check console for details.');
    }
  };

  const fetchData = async () => {
    try {
      setLoadingData(true);
      const endDate = new Date();
      const startDate = new Date(Date.now() - chartTimeRange * 24 * 60 * 60 * 1000);
      const [usersData, statsData, healthData, eventStatsData] = await Promise.all([
        getAdminUsers(),
        getAdminStats(),
        getAdminHealth(),
        getEventStats(null, startDate.toISOString(), endDate.toISOString())
      ]);
      
      // Data loaded successfully; debug logging removed to keep console clean
      setUsers(usersData);
      setStats(statsData);
      setAdminHealth(healthData);
      setEventStats(eventStatsData);
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Data fetch error:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTimeRange]);

  useEffect(() => {
    const loadOutreachLeads = async () => {
      if (activeTab !== 'outreach') return;
      try {
        setOutreachLeadsLoading(true);
        const leads = await getCoachOutreachLeads();
        setOutreachLeads(Array.isArray(leads) ? leads : []);
      } catch (err) {
        const message = err?.response?.data?.error || 'Failed to load outreach leads';
        addNotification(message, 'error');
      } finally {
        setOutreachLeadsLoading(false);
      }
    };
    loadOutreachLeads();
  }, [activeTab, addNotification]);

  const handleLoadMoreCoachAthletes = async (coach) => {
    const coachId = coach?._id;
    if (!coachId) return;

    if (coachAthletesLoadingByCoachId[coachId]) return;

    const currentAthletes = coachAthletesByCoachId[coachId]?.athletes ?? coach.athletes ?? [];
    const totalLinked = coachAthletesByCoachId[coachId]?.totalLinked ?? coach.athletesLinkedCount ?? 0;

    // Nothing to load if we already have everything.
    if (totalLinked > 0 && currentAthletes.length >= totalLinked) return;

    setCoachAthletesLoadingByCoachId((prev) => ({ ...prev, [coachId]: true }));
    try {
      const { athletes: nextAthletes = [], totalLinked: totalLinkedResp, totalWithPassword: totalWithPasswordResp } =
        await getCoachAthletesPage(coachId, { limit: 20, offset: currentAthletes.length });

      const merged = [...currentAthletes, ...nextAthletes];
      setCoachAthletesByCoachId((prev) => ({
        ...prev,
        [coachId]: {
          athletes: merged,
          totalLinked: totalLinkedResp ?? prev[coachId]?.totalLinked ?? coach.athletesLinkedCount ?? merged.length,
          totalWithPassword: totalWithPasswordResp ?? prev[coachId]?.totalWithPassword ?? coach.athletesCount ?? 0
        }
      }));
    } catch (e) {
      console.error('Failed to load more coach athletes:', e);
      addNotification('Failed to load more athletes', 'error');
    } finally {
      setCoachAthletesLoadingByCoachId((prev) => ({ ...prev, [coachId]: false }));
    }
  };


  const handleUserUpdate = async (userId, userData) => {
    try {
      await updateUserAdmin(userId, userData);
      addNotification('User updated successfully', 'success');
      setEditingUser(null);
      fetchData(); // Refresh data
    } catch (err) {
      addNotification('Failed to update user', 'error');
      console.error('Update error:', err);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    const isSelf = currentUser?.id === targetUser._id || currentUser?._id === targetUser._id;
    if (isSelf) {
      addNotification('You cannot delete your own account here.', 'error');
      return;
    }
    const confirmMsg = `Delete user "${targetUser.name || ''} ${targetUser.surname || ''}". ${targetUser.email}\n\nThis will permanently delete the account and all associated data (trainings, tests, Strava activities, etc.). This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      setDeleteLoadingUserId(targetUser._id);
      await deleteUserAdmin(targetUser._id);
      addNotification(`User ${targetUser.email} deleted`, 'success');
      fetchData();
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to delete user';
      addNotification(msg, 'error');
      console.error('Delete user error:', err);
    } finally {
      setDeleteLoadingUserId(null);
    }
  };

  const handleDeleteAthleteWithTests = async (athlete) => {
    const isSelf = currentUser?.id === athlete._id || currentUser?._id === athlete._id;
    if (isSelf) {
      addNotification('You cannot delete your own account here.', 'error');
      return;
    }
    
    const testCount = athlete.testCount || 0;
    const confirmMsg = `Delete athlete "${athlete.name || ''} ${athlete.surname || ''}" (${athlete.email})?\n\nThis will permanently delete:\n- Athlete account\n- All ${testCount} tests\n- All trainings\n- All Strava activities\n- All other associated data\n\nThis is useful for problematic athletes causing freeze issues. This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    
    try {
      setDeleteAthleteLoadingId(athlete._id);
      const result = await deleteAthleteWithTests(athlete._id);
      addNotification(`Athlete ${athlete.email} and all data deleted successfully (${result.deletedData?.tests || 0} tests, ${result.deletedData?.trainings || 0} trainings)`, 'success');
      fetchData();
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to delete athlete';
      addNotification(msg, 'error');
      console.error('Delete athlete error:', err);
    } finally {
      setDeleteAthleteLoadingId(null);
    }
  };

  const handleSendReactivationEmail = async (targetUser) => {
    try {
      setEmailLoadingUserId(targetUser._id);
      await sendReactivationEmail(targetUser._id);
      addNotification(`Reactivation email sent to ${targetUser.email}`, 'success');
    } catch (err) {
      const data = err?.response?.data;
      let message;
      if (err?.response?.status >= 500) {
        message = data?.reason
          ? `Server error while sending reactivation email: ${data.reason}`
          : 'Server error while sending reactivation email. Please try again in a moment.';
      } else {
        message = data?.reason
          ? `${data.error || 'Failed to send reactivation email'}: ${data.reason}`
          : (data?.error || 'Failed to send reactivation email');
      }
      addNotification(message, 'error');
      console.error('Reactivation email error:', err);
    } finally {
      setEmailLoadingUserId(null);
    }
  };

  const handleSendThankYouEmail = async (targetUser) => {
    try {
      setThankYouEmailLoadingUserId(targetUser._id);
      await sendThankYouEmail(targetUser._id);
      addNotification(`Thank you email sent to ${targetUser.email}`, 'success');
    } catch (err) {
      const data = err?.response?.data;
      let message;
      if (err?.code === 'ERR_NETWORK') {
        message = 'Network error – backend unreachable. If using Render: wait ~30s (cold start) and try again, or set ALLOW_LOCALHOST_ORIGIN=true on the server.';
      } else {
        message = data?.reason ? `${data.error || 'Failed to send thank you email'}: ${data.reason}` : (data?.error || 'Failed to send thank you email');
      }
      addNotification(message, 'error');
      if (data) console.error('Thank you email error:', data);
      else console.error('Thank you email error:', err);
    } finally {
      setThankYouEmailLoadingUserId(null);
    }
  };

  const handleSendFeatureAnnouncementEmail = async (targetUser, emailType = null) => {
    try {
      setFeatureAnnouncementEmailLoadingUserId(targetUser._id);
      const typeToSend = emailType || featureAnnouncementEmailType;
      await sendFeatureAnnouncementEmail(targetUser._id, typeToSend);
      const emailTypeNames = {
        'newFeatures': 'New Features',
        'googleLoginFix': 'Google Login Fix',
        'improvements': 'Improvements',
        'tips': 'Tips',
        'community': 'Community',
        'thresholdLogicUpdate': 'LT1/LT2 + Zones Update'
      };
      addNotification(`${emailTypeNames[typeToSend] || 'Feature announcement'} email sent to ${targetUser.email}`, 'success');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to send feature announcement email';
      addNotification(message, 'error');
      console.error('Feature announcement email error:', err);
    } finally {
      setFeatureAnnouncementEmailLoadingUserId(null);
    }
  };

  const handleSendStravaReminderEmail = async (targetUser) => {
    try {
      setStravaReminderEmailLoadingUserId(targetUser._id);
      await sendStravaReminderEmail(targetUser._id);
      const nowIso = new Date().toISOString();
      setUsers((prev) =>
        prev.map((u) =>
          u._id === targetUser._id
            ? {
                ...u,
                stravaReminderEmail: {
                  sent: true,
                  sentCount: (u.stravaReminderEmail?.sentCount || 0) + 1,
                  lastSent: nowIso,
                },
              }
            : u
        )
      );
      const sentAtText = new Date(nowIso).toLocaleString();
      addNotification(`Strava reminder email sent to ${targetUser.email} at ${sentAtText}`, 'success');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to send Strava reminder email';
      addNotification(message, 'error');
      console.error('Strava reminder email error:', err);
    } finally {
      setStravaReminderEmailLoadingUserId(null);
    }
  };

  const handleSendAppDownloadEmail = async (targetUser) => {
    try {
      setAppDownloadEmailLoadingUserId(targetUser._id);
      await sendAppDownloadEmail(targetUser._id);
      const nowIso = new Date().toISOString();
      setUsers((prev) =>
        prev.map((u) =>
          u._id === targetUser._id
            ? {
                ...u,
                appDownloadEmail: {
                  sent: true,
                  sentCount: (u.appDownloadEmail?.sentCount || 0) + 1,
                  lastSent: nowIso,
                },
              }
            : u
        )
      );
      addNotification(`App download email sent to ${targetUser.email}`, 'success');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to send app download email';
      addNotification(message, 'error');
      console.error('App download email error:', err);
    } finally {
      setAppDownloadEmailLoadingUserId(null);
    }
  };

  const handleSendThankYouEmailToAll = async () => {
    if (!window.confirm(`Are you sure you want to send thank you emails to ALL ${users.length} users? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setSendingToAll(true);
      await sendThankYouEmailToAll();
      addNotification(`Thank you emails sent to all ${users.length} users`, 'success');
    } catch (err) {
      const data = err?.response?.data;
      const message = data?.reason ? `${data.error || 'Failed to send thank you emails'}: ${data.reason}` : (data?.error || 'Failed to send thank you emails to all users');
      addNotification(message, 'error');
      console.error('Thank you email to all error:', err);
    } finally {
      setSendingToAll(false);
    }
  };

  // Calculate unit statistics
  const unitStats = useMemo(() => {
    const metric = users.filter(u => u.units?.distance === 'metric' || !u.units?.distance).length;
    const imperial = users.filter(u => u.units?.distance === 'imperial').length;
    return { metric, imperial, total: users.length };
  }, [users]);

  // Calculate last login statistics
  const lastLoginStats = useMemo(() => {
    const now = new Date();
    const last24h = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin)) < 24 * 60 * 60 * 1000).length;
    const last7d = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin)) < 7 * 24 * 60 * 60 * 1000).length;
    const last30d = users.filter(u => u.lastLogin && (now - new Date(u.lastLogin)) < 30 * 24 * 60 * 60 * 1000).length;
    const never = users.filter(u => !u.lastLogin).length;
    return { last24h, last7d, last30d, never };
  }, [users]);

  const mobileAppStats = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const withApp = users.filter((u) => u.hasMobileApp).length;
    const active7d = users.filter((u) => u.mobileAppLastSeen && (now - new Date(u.mobileAppLastSeen)) < weekMs).length;
    const ios = users.filter((u) => u.mobileAppPlatform === 'ios').length;
    const android = users.filter((u) => u.mobileAppPlatform === 'android').length;
    return { withApp, active7d, ios, android };
  }, [users]);

  const retentionFilteredUsers = useMemo(() => {
    const q = retentionSearch.toLowerCase();
    return users
      .filter(u => u.email && u.isActive !== false)
      .filter(u => !q || u.email?.toLowerCase().includes(q) || `${u.name} ${u.surname}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [users, retentionSearch]);

  // Prepare login, tests, and registrations chart data
  const loginChartData = useMemo(() => {
    if (!eventStats?.daily) return [];
    
    const loginEvents = eventStats.daily.filter(e => e._id.type === 'login');
    const testEvents = eventStats.daily.filter(e => e._id.type === 'test_created');
    const registerEvents = eventStats.daily.filter(e => e._id.type === 'register');
    
    // Group by date
    const dateMap = new Map();
    
    loginEvents.forEach(e => {
      const date = e._id.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, logins: 0, tests: 0, registrations: 0 });
      }
      dateMap.get(date).logins = e.count;
    });
    
    testEvents.forEach(e => {
      const date = e._id.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, logins: 0, tests: 0, registrations: 0 });
      }
      dateMap.get(date).tests = e.count;
    });

    registerEvents.forEach(e => {
      const date = e._id.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, logins: 0, tests: 0, registrations: 0 });
      }
      dateMap.get(date).registrations = e.count;
    });
    
    let data = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    
    // Group by week if needed
    if (chartGroupBy === 'week') {
      const weekMap = new Map();
      data.forEach(item => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weekMap.has(weekKey)) {
          weekMap.set(weekKey, { date: weekKey, logins: 0, tests: 0, registrations: 0 });
        }
        weekMap.get(weekKey).logins += item.logins;
        weekMap.get(weekKey).tests += item.tests;
        weekMap.get(weekKey).registrations += (item.registrations || 0);
      });
      data = Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // Format dates for display
    return data.map(item => ({
      ...item,
      dateLabel: chartGroupBy === 'week' 
        ? `Week ${new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
  }, [eventStats, chartGroupBy]);

  // Filter users based on search query (email or name) and limit
  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const name = `${user.name || ''} ${user.surname || ''}`.toLowerCase();
      return email.includes(query) || name.includes(query);
    });

    // Premium filter — uses server-resolved premiumSource so the chips
    // behave consistently with the badges shown on each row.
    if (premiumFilter !== 'all') {
      filtered = filtered.filter((u) => {
        const source = u.premiumSource;
        const status = u.subscription?.status;
        switch (premiumFilter) {
          case 'free':
            return !u.isPremium;
          case 'any':
            return !!u.isPremium;
          case 'manual':
            return source === 'manual';
          case 'paid':
            return source === 'subscription' && status === 'active';
          case 'trial':
            return source === 'subscription' && status === 'trialing';
          default:
            return true;
        }
      });
    }

    if (stravaFilter === 'connected') {
      filtered = filtered.filter((u) => u.stravaConnected);
    } else if (stravaFilter === 'notConnected') {
      filtered = filtered.filter((u) => !u.stravaConnected);
    }

    if (mobileAppFilter === 'hasApp') {
      filtered = filtered.filter((u) => u.hasMobileApp);
    } else if (mobileAppFilter === 'active7d') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((u) => u.mobileAppLastSeen && new Date(u.mobileAppLastSeen) >= new Date(weekAgo));
    } else if (mobileAppFilter === 'noApp') {
      filtered = filtered.filter((u) => !u.hasMobileApp);
    }

    // Sort by last login (most recent first)
    filtered = filtered.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return 0;
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return new Date(b.lastLogin) - new Date(a.lastLogin);
    });

    // Apply limit
    return filtered.slice(0, usersLimit);
  }, [users, searchQuery, premiumFilter, stravaFilter, mobileAppFilter, usersLimit]);

  /**
   * Counts of users in each premium bucket — drives the filter chip labels.
   * Computed off the unfiltered `users` array so the numbers stay stable
   * regardless of which filter is currently active.
   */
  const premiumCounts = useMemo(() => {
    const c = { all: users.length, free: 0, any: 0, manual: 0, paid: 0, trial: 0 };
    users.forEach((u) => {
      if (u.isPremium) c.any += 1; else c.free += 1;
      if (u.premiumSource === 'manual') c.manual += 1;
      if (u.premiumSource === 'subscription') {
        if (u.subscription?.status === 'active') c.paid += 1;
        else if (u.subscription?.status === 'trialing') c.trial += 1;
      }
    });
    return c;
  }, [users]);

  // Marketing users with recommendations
  const marketingUsers = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    return users
      .filter(user => {
        // Only include users with email and email notifications enabled
        if (!user.email) return false;
        if (user.notifications?.emailNotifications === false) return false;
        return true;
      })
      .map(user => {
        const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
        const daysSinceLogin = lastLogin ? Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : null;
        
        // Add activity indicators (needed for feature announcement scoring)
        const hasTests = (user.testCount || 0) > 0;
        const hasTrainings = (user.trainingCount || 0) > 0;
        const isActive = hasTests || hasTrainings;
        
        // For thank you email
        const thankYouSent = user.thankYouEmail?.sent || false;
        const thankYouLastSent = user.thankYouEmail?.lastSent ? new Date(user.thankYouEmail.lastSent) : null;
        const daysSinceThankYou = thankYouLastSent ? Math.floor((now - thankYouLastSent) / (1000 * 60 * 60 * 24)) : null;
        
        // Calculate recommendation score for thank you email
        let thankYouScore = 0;
        let thankYouReason = '';
        if (!thankYouSent) {
          thankYouScore = 100; // Highest priority - never sent
          thankYouReason = 'Never sent';
        } else if (daysSinceThankYou && daysSinceThankYou > 90) {
          thankYouScore = 80; // High priority - sent long time ago
          thankYouReason = `Sent ${daysSinceThankYou} days ago`;
        } else if (daysSinceThankYou && daysSinceThankYou > 30) {
          thankYouScore = 50; // Medium priority
          thankYouReason = `Sent ${daysSinceThankYou} days ago`;
        } else {
          thankYouScore = 10; // Low priority - recently sent
          thankYouReason = `Sent ${daysSinceThankYou} days ago`;
        }

        // For feature announcement email
        const featureAnnouncementSent = user.featureAnnouncementEmail?.sent || false;
        const featureAnnouncementLastSent = user.featureAnnouncementEmail?.lastSent ? new Date(user.featureAnnouncementEmail.lastSent) : null;
        const daysSinceFeatureAnnouncement = featureAnnouncementLastSent ? Math.floor((now - featureAnnouncementLastSent) / (1000 * 60 * 60 * 24)) : null;
        
        // Calculate recommendation score for feature announcement email
        // Priority: active users who haven't received it recently
        let featureAnnouncementScore = 0;
        let featureAnnouncementReason = '';
        if (!featureAnnouncementSent) {
          // Never sent - high priority for active users
          featureAnnouncementScore = isActive ? 90 : 60;
          featureAnnouncementReason = isActive ? 'Never sent (active user)' : 'Never sent';
        } else if (daysSinceFeatureAnnouncement && daysSinceFeatureAnnouncement > 60) {
          // Sent more than 60 days ago - good time for update
          featureAnnouncementScore = isActive ? 80 : 50;
          featureAnnouncementReason = `Sent ${daysSinceFeatureAnnouncement} days ago`;
        } else if (daysSinceFeatureAnnouncement && daysSinceFeatureAnnouncement > 30) {
          // Sent 30-60 days ago - medium priority
          featureAnnouncementScore = isActive ? 60 : 40;
          featureAnnouncementReason = `Sent ${daysSinceFeatureAnnouncement} days ago`;
        } else {
          // Recently sent - low priority
          featureAnnouncementScore = 20;
          featureAnnouncementReason = `Sent ${daysSinceFeatureAnnouncement} days ago`;
        }

        // Calculate recommendation score for reactivation email
        let reactivationScore = 0;
        let reactivationReason = '';
        if (!lastLogin) {
          reactivationScore = 100; // Highest priority - never logged in
          reactivationReason = 'Never logged in';
        } else if (lastLogin < ninetyDaysAgo) {
          reactivationScore = 90; // Very high priority - inactive for 90+ days
          reactivationReason = `Inactive ${daysSinceLogin} days`;
        } else if (lastLogin < thirtyDaysAgo) {
          reactivationScore = 70; // High priority - inactive for 30+ days
          reactivationReason = `Inactive ${daysSinceLogin} days`;
        } else {
          reactivationScore = 20; // Low priority - recently active
          reactivationReason = `Active ${daysSinceLogin} days ago`;
        }

        return {
          ...user,
          daysSinceLogin,
          thankYouSent,
          thankYouLastSent,
          daysSinceThankYou,
          thankYouScore,
          thankYouReason,
          reactivationScore,
          reactivationReason,
          featureAnnouncementSent,
          featureAnnouncementLastSent,
          daysSinceFeatureAnnouncement,
          featureAnnouncementScore,
          featureAnnouncementReason,
          hasTests,
          hasTrainings,
          isActive
        };
      })
      .sort((a, b) => {
        // Sort by recommendation score (highest first)
        if (marketingEmailType === 'thankYou') {
          return b.thankYouScore - a.thankYouScore;
        } else if (marketingEmailType === 'reactivation') {
          return b.reactivationScore - a.reactivationScore;
        } else {
          return b.featureAnnouncementScore - a.featureAnnouncementScore;
        }
      });
  }, [users, marketingEmailType]);

  // Filter marketing users based on selected filter
  const filteredMarketingUsers = useMemo(() => {
    let filtered = marketingUsers;

    if (marketingFilter === 'notSent') {
      if (marketingEmailType === 'thankYou') {
        filtered = filtered.filter(u => !u.thankYouSent);
      } else if (marketingEmailType === 'reactivation') {
        // For reactivation, show users who haven't logged in recently
        filtered = filtered.filter(u => !u.lastLogin || new Date(u.lastLogin) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      } else {
        // For feature announcement
        filtered = filtered.filter(u => !u.featureAnnouncementSent);
      }
    } else if (marketingFilter === 'sent') {
      if (marketingEmailType === 'thankYou') {
        filtered = filtered.filter(u => u.thankYouSent);
      } else if (marketingEmailType === 'reactivation') {
        // For reactivation, show users who have logged in recently
        filtered = filtered.filter(u => u.lastLogin && new Date(u.lastLogin) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      } else {
        // For feature announcement
        filtered = filtered.filter(u => u.featureAnnouncementSent);
      }
    } else if (marketingFilter === 'recommended') {
      if (marketingEmailType === 'thankYou') {
        filtered = filtered.filter(u => u.thankYouScore >= 50);
      } else if (marketingEmailType === 'reactivation') {
        filtered = filtered.filter(u => u.reactivationScore >= 50);
      } else {
        filtered = filtered.filter(u => u.featureAnnouncementScore >= 50);
      }
    }

    if (marketingSearchQuery.trim()) {
      const query = marketingSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((u) => {
        const name = `${u.name || ''} ${u.surname || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }

    return filtered;
  }, [marketingUsers, marketingFilter, marketingEmailType, marketingSearchQuery]);

  const emailCampaignStats = useMemo(() => {
    const totalUsers = users.length;
    const emailEligibleUsers = users.filter(u => u.email && u.notifications?.emailNotifications !== false).length;

    const sentUsersThankYou = users.filter(u => u.thankYouEmail?.sent).length;
    const sentUsersFeature = users.filter(u => u.featureAnnouncementEmail?.sent).length;
    const sentUsersReactivation = users.filter(u => u.reactivationEmail?.sent).length;
    const sentUsersStravaReminder = users.filter(u => u.stravaReminderEmail?.sent).length;

    const totalSentThankYou = users.reduce((sum, u) => sum + (u.thankYouEmail?.sentCount || 0), 0);
    const totalSentFeature = users.reduce((sum, u) => sum + (u.featureAnnouncementEmail?.sentCount || 0), 0);
    const totalSentReactivation = users.reduce((sum, u) => sum + (u.reactivationEmail?.sentCount || 0), 0);
    const totalSentStravaReminder = users.reduce((sum, u) => sum + (u.stravaReminderEmail?.sentCount || 0), 0);

    const byType = [
      { type: 'Thank You', sentUsers: sentUsersThankYou, totalSent: totalSentThankYou },
      { type: 'Feature', sentUsers: sentUsersFeature, totalSent: totalSentFeature },
      { type: 'Reactivation', sentUsers: sentUsersReactivation, totalSent: totalSentReactivation },
      { type: 'Strava Reminder', sentUsers: sentUsersStravaReminder, totalSent: totalSentStravaReminder }
    ];

    return {
      totalUsers,
      emailEligibleUsers,
      totalCampaignSends: totalSentThankYou + totalSentFeature + totalSentReactivation + totalSentStravaReminder,
      byType
    };
  }, [users]);

  const handleBulkSend = async () => {
    if (selectedUsersForBulk.length === 0) {
      addNotification('Please select at least one user', 'warning');
      return;
    }

    if (!window.confirm(`Are you sure you want to send ${marketingEmailType === 'thankYou' ? 'thank you' : 'reactivation'} emails to ${selectedUsersForBulk.length} users?`)) {
      return;
    }

    setBulkSending(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedUsersForBulk.length; i++) {
      const userId = selectedUsersForBulk[i];
      try {
        if (marketingEmailType === 'thankYou') {
          await sendThankYouEmail(userId);
        } else if (marketingEmailType === 'reactivation') {
          await sendReactivationEmail(userId);
        } else if (marketingEmailType === 'googleLoginFix') {
          await sendFeatureAnnouncementEmail(userId, 'googleLoginFix');
        } else {
          await sendFeatureAnnouncementEmail(userId, featureAnnouncementEmailType);
        }
        successCount++;
        
        // Add small delay between emails to avoid overwhelming the server
        if (i < selectedUsersForBulk.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        }
      } catch (err) {
        console.error(`Failed to send email to user ${userId}:`, err);
        failCount++;
      }
    }

    setBulkSending(false);
    setSelectedUsersForBulk([]);
    addNotification(`Sent ${successCount} emails successfully${failCount > 0 ? `, ${failCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsersForBulk(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const selectAllFiltered = () => {
    setSelectedUsersForBulk(filteredMarketingUsers.map(u => u._id));
  };

  const clearSelection = () => {
    setSelectedUsersForBulk([]);
  };

  const handleSendCoachOutreachEmail = async () => {
    const name = outreachName.trim();
    const email = outreachEmail.trim().toLowerCase();
    if (!email) {
      addNotification('Please provide email', 'warning');
      return;
    }
    try {
      setOutreachSending(true);
      await sendCoachOutreachEmail({ name, email });
      addNotification(`Outreach email sent to ${email}`, 'success');
      setOutreachName('');
      setOutreachEmail('');
      const leads = await getCoachOutreachLeads();
      setOutreachLeads(Array.isArray(leads) ? leads : []);
    } catch (err) {
      const data = err?.response?.data;
      const message = data?.reason ? `${data.error || 'Failed to send outreach email'}: ${data.reason}` : (data?.error || 'Failed to send outreach email');
      addNotification(message, 'error');
      console.error('Coach outreach email error:', err);
    } finally {
      setOutreachSending(false);
    }
  };

  const handleOutreachLeadToggle = async (leadId, field, value) => {
    try {
      setOutreachLeadUpdatingId(`${leadId}:${field}`);
      const updated = await updateCoachOutreachLead(leadId, { [field]: value });
      setOutreachLeads((prev) => prev.map((l) => (l._id === leadId ? updated : l)));
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to update outreach lead';
      addNotification(message, 'error');
    } finally {
      setOutreachLeadUpdatingId(null);
    }
  };

  // Open compose modal for a contact
  const openCompose = (contact) => {
    const { subject, body } = buildOutreachEmail(contact);
    setComposeContact(contact);
    setComposeSubject(subject);
    setComposeBody(body);
  };

  const closeCompose = () => {
    setComposeContact(null);
    setComposeSubject('');
    setComposeBody('');
    setComposeSending(false);
    setComposePreviewSending(false);
  };

  const handlePreviewSend = async () => {
    if (!composeContact?.email || composePreviewSending) return;
    try {
      setComposePreviewSending(true);
      const result = await sendCoachOutreachEmail({
        name: composeContact.name,
        email: composeContact.email,
        subject: composeSubject,
        body: composeBody,
        preview: true,
      });
      addNotification(result?.message || `Preview sent to your email`, 'success');
    } catch (err) {
      const data = err?.response?.data;
      const message = data?.reason ? `${data.error || 'Failed'}: ${data.reason}` : (data?.error || 'Failed to send preview');
      addNotification(message, 'error');
    } finally {
      setComposePreviewSending(false);
    }
  };

  const handleComposeSend = async () => {
    if (!composeContact?.email || composeSending) return;
    try {
      setComposeSending(true);
      await sendCoachOutreachEmail({
        name: composeContact.name,
        email: composeContact.email,
        subject: composeSubject,
        body: composeBody,
      });
      // Refresh leads to reflect new sentCount
      const leads = await getCoachOutreachLeads();
      setOutreachLeads(Array.isArray(leads) ? leads : []);
      addNotification(`Email sent to ${composeContact.email}`, 'success');
      closeCompose();
    } catch (err) {
      const data = err?.response?.data;
      const message = data?.reason ? `${data.error || 'Failed'}: ${data.reason}` : (data?.error || 'Failed to send email');
      addNotification(message, 'error');
    } finally {
      setComposeSending(false);
    }
  };

  // ── Bulk campaign handlers ───────────────────────────────────────────────────

  const handleCsvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImportFile(file);
    setCsvImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setCsvImportPreview({ leads: [], withEmail: 0 }); return; }

        // Auto-detect delimiter
        const header = lines[0];
        const delim = header.includes('\t') ? '\t' : ',';
        const cols = header.split(delim).map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());

        const idx = (names) => {
          for (const n of names) {
            const i = cols.findIndex(c => c.includes(n));
            if (i >= 0) return i;
          }
          return -1;
        };

        const iName = idx(['název', 'name', 'club', 'nazev']);
        const iEmail = idx(['email', 'e-mail']);
        const iCity = idx(['město', 'mesto', 'city']);
        const iCountry = idx(['země', 'zeme', 'country', 'land']);
        const iType = idx(['typ', 'type', 'kategorie']);
        const iWebsite = idx(['web url', 'website', 'web', 'url']);
        const iPhone = idx(['telefon', 'phone', 'tel']);
        const iPriority = idx(['priorita', 'priority']);

        const leads = lines.slice(1).map(line => {
          const parts = line.split(delim).map(p => p.trim().replace(/^"|"$/g, ''));
          const get = (i) => (i >= 0 ? (parts[i] || '') : '');
          return {
            name: get(iName),
            email: get(iEmail).toLowerCase(),
            city: get(iCity),
            country: get(iCountry),
            type: get(iType),
            website: get(iWebsite),
            phone: get(iPhone),
            priority: parseFloat(get(iPriority)) || 0,
          };
        }).filter(l => l.name || l.email);

        const withEmail = leads.filter(l => l.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)).length;
        setCsvImportPreview({ leads, withEmail });
      } catch (err) {
        console.error('CSV parse error:', err);
        setCsvImportPreview({ leads: [], withEmail: 0 });
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleCsvImport = async () => {
    if (!csvImportPreview?.leads?.length || csvImporting) return;
    try {
      setCsvImporting(true);
      const result = await importCoachOutreachLeads(csvImportPreview.leads);
      setCsvImportResult(result);
      addNotification(`Imported ${result.inserted} leads (${result.skipped} duplicates skipped)`, 'success');
      // Refresh leads list
      const leads = await getCoachOutreachLeads();
      setOutreachLeads(Array.isArray(leads) ? leads : []);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to import leads';
      addNotification(msg, 'error');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleStartBulkCampaign = async () => {
    if (bulkStarting) return;
    setBulkCampaignError('');
    try {
      setBulkStarting(true);
      const result = await startBulkOutreachCampaign({
        filter: {
          types: bulkFilterTypes,
          countries: bulkFilterCountries,
          notContacted: bulkNotContacted,
          onlyWithEmail: bulkOnlyWithEmail,
        },
        batchSize: bulkBatchSize,
        intervalMinutes: bulkInterval,
        subject: bulkSubject,
        template: bulkTemplate,
      });
      addNotification(`Bulk campaign started — ${result.total} leads, ${result.batchSize} per batch`, 'success');
      // Refresh campaign list
      const campaigns = await listBulkCampaigns();
      setBulkCampaigns(Array.isArray(campaigns) ? campaigns : []);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to start campaign';
      setBulkCampaignError(msg);
      addNotification(msg, 'error');
    } finally {
      setBulkStarting(false);
    }
  };

  const handleStopBulkCampaign = async (campaignId) => {
    try {
      await stopBulkCampaign(campaignId);
      addNotification('Campaign stopped', 'success');
      const campaigns = await listBulkCampaigns();
      setBulkCampaigns(Array.isArray(campaigns) ? campaigns : []);
    } catch (err) {
      addNotification('Failed to stop campaign', 'error');
    }
  };

  const handleRefreshCampaigns = async () => {
    try {
      setBulkCampaignsLoading(true);
      const campaigns = await listBulkCampaigns();
      setBulkCampaigns(Array.isArray(campaigns) ? campaigns : []);
    } catch (err) {
      console.error('Failed to refresh campaigns:', err);
    } finally {
      setBulkCampaignsLoading(false);
    }
  };

  // ── Preview email to yourself for a specific lead ───────────────────────────
  const handleLeadPreview = async (lead) => {
    setLeadsPreviewingId(lead._id);
    try {
      await sendCoachOutreachEmail({ name: lead.name, email: lead.email, preview: true });
      addNotification('Preview sent to your email!', 'success');
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Preview failed', 'error');
    } finally {
      setLeadsPreviewingId(null);
    }
  };

  const handleLeadSend = async (lead) => {
    // Confirm() prompt removed 2026-05 — admin flow is high-volume (sending
    // dozens of leads a day from the table), and the surrounding UI already
    // makes intent unambiguous (explicit Send button, separate from Preview).
    // The "Sent" indicator + post-send toast give enough feedback that an
    // accidental misclick is recoverable.
    setLeadsSendingId(lead._id);
    try {
      await sendCoachOutreachEmail({ name: lead.name, email: lead.email });
      addNotification(`Email sent to ${lead.email}`, 'success');
      // Refresh leads list to update sentCount
      const fresh = await getCoachOutreachLeads();
      setOutreachLeads(Array.isArray(fresh) ? fresh : []);
    } catch (err) {
      addNotification(err?.response?.data?.error || 'Send failed', 'error');
    } finally {
      setLeadsSendingId(null);
    }
  };

  // Filtered + searched leads table (DB leads only)
  const filteredLeads = useMemo(() => {
    let list = outreachLeads.filter(l => l.source === 'csv' || l.city || l.country || l.type);
    if (!leadsShowContacted) list = list.filter(l => !l.sentCount || l.sentCount === 0);
    if (leadsTypeFilter) list = list.filter(l => l.type === leadsTypeFilter);
    if (leadsSearch) {
      const q = leadsSearch.toLowerCase();
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q) ||
        (l.country || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [outreachLeads, leadsSearch, leadsTypeFilter, leadsShowContacted]);

  const CLUB_TYPES = [
    'triathlon club', 'cycling club', 'running club', 'swimming club',
    'sports performance center', 'athletic club', 'endurance coach', 'sports clinic',
  ];

  // Build filtered contacts list (merge static data with DB lead status)
  const filteredContacts = useMemo(() => {
    const leadByEmail = {};
    outreachLeads.forEach(l => { leadByEmail[l.email] = l; });

    return OUTREACH_CONTACTS
      .filter(c => {
        if (outreachFilter === 'lab') return c.category === 'lab';
        if (outreachFilter === 'coach') return c.category === 'coach';
        if (outreachFilter === 'priority') return c.priority;
        if (outreachFilter === 'email-only') return !!c.email;
        // Default "not contacted" filter — only contacts with an email AND
        // not yet logged as sent in the DB. This is the actionable list
        // (you can't send to someone without an email).
        if (outreachFilter === 'not-contacted') return !!c.email && !leadByEmail[c.email];
        return true;
      })
      .filter(c => !outreachCountry || c.country === outreachCountry)
      .filter(c => {
        if (!outreachSearch) return true;
        const q = outreachSearch.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
      })
      .map(c => ({ ...c, lead: leadByEmail[c.email] || null }));
  }, [outreachLeads, outreachFilter, outreachCountry, outreachSearch]);

  const outreachStats = useMemo(() => {
    const leadByEmail = {};
    outreachLeads.forEach(l => { leadByEmail[l.email] = l; });
    const withEmail = OUTREACH_CONTACTS.filter(c => c.email);
    const contacted = withEmail.filter(c => leadByEmail[c.email]?.sentCount > 0);
    const responded = outreachLeads.filter(l => l.responded);
    const registered = outreachLeads.filter(l => l.registered);
    return { total: OUTREACH_CONTACTS.length, withEmail: withEmail.length, contacted: contacted.length, responded: responded.length, registered: registered.length };
  }, [outreachLeads]);

  if (loading) return null;
  if (!currentUser?.admin) {
    return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6">
        <PageSkeleton cards={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isFeatureAnnouncementMode =
    marketingEmailType === 'featureAnnouncement' || marketingEmailType === 'googleLoginFix';

  const tabs = [
    { id: 'overview',   name: 'Overview',   icon: '📊' },
    { id: 'health',     name: 'Health',     icon: '🩺' },
    { id: 'users',      name: 'Users',      icon: '👥' },
    { id: 'marketing',  name: 'Marketing',  icon: '📧' },
    { id: 'retention',  name: 'Retention',  icon: '🔁' },
    { id: 'outreach',   name: 'Outreach',   icon: '🎯' },
    { id: 'analytics',  name: 'Analytics',  icon: '📈' },
  ];

  const RETENTION_TYPES = [
    // ── Tests & Performance ──
    { value: 'weekly',              label: '📊 Weekly Progress'          },
    { value: 'monthly',             label: '📈 Monthly Report'            },
    { value: 'testReminder',        label: '🧪 Test Reminder'             },
    { value: 'lt2Improvement',      label: '⚡ LT2 Improvement'           },
    { value: 'thresholdInsight',    label: '🔬 Threshold Insight'         },
    // ── Training ──
    { value: 'trainingWeekSummary', label: '🏃 Training Week Summary'     },
    { value: 'trainingTips',        label: '💡 Training Tips'             },
    { value: 'zoneTraining',        label: '🎯 Zone Training Guide'       },
    { value: 'recoveryReminder',    label: '😴 Recovery & Rest Reminder'  },
    { value: 'periodization',       label: '📅 Periodization Guide'       },
    // ── Nutrition ──
    { value: 'nutritionTips',       label: '🥗 Nutrition & Fueling Tips'  },
    { value: 'raceNutrition',       label: '🍌 Race-Day Nutrition Guide'  },
    { value: 'hydrationTips',       label: '💧 Hydration Tips'            },
    // ── Strava & Integrations ──
    { value: 'stravaIntegration',   label: '🔗 Strava Integration Tips'   },
    { value: 'stravaWeekStats',     label: '📍 Strava Weekly Highlights'  },
    // ── Milestones & Anniversaries ──
    { value: 'milestone_firstTest', label: '🎯 Milestone · 1st test'      },
    { value: 'milestone_fiveTests', label: '🏅 Milestone · 5 tests'       },
    { value: 'milestone_tenTests',  label: '🏆 Milestone · 10 tests'      },
    { value: 'anniversary_6',       label: '🎉 Anniversary · 6 months'    },
    { value: 'anniversary_12',      label: '🏆 Anniversary · 1 year'      },
    // ── Re-engagement ──
    { value: 'reEngagement',        label: '👋 Re-engagement'             },
    { value: 'inactiveReminder',    label: '🔔 Inactive Athlete Reminder' },
  ];

  const handleSendRetentionPreview = async (userId) => {
    setRetentionSending(userId);
    setRetentionResult(null);
    try {
      const data = await sendRetentionEmailPreview(userId, retentionEmailType);
      setRetentionResult({ ok: true, msg: data.message || 'Sent!' });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send.';
      setRetentionResult({ ok: false, msg });
    } finally {
      setRetentionSending(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="w-full px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-4 sm:py-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm sm:text-base text-gray-600">Manage your application and users</p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:space-x-4 w-full sm:w-auto">
              <div className="text-xs sm:text-sm text-gray-500">
                Last updated: {new Date().toLocaleString()}
              </div>
              <button
                onClick={fetchData}
                className="w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm sm:text-base"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="w-full px-4 sm:px-6">
          <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-1 sm:mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-4 sm:px-6 py-4 sm:py-6 lg:py-8">
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">👥</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{users.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {users.filter(u => u.hasPassword).length} with password set
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">🏃</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Athletes</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.usersByRole?.athlete || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">👨‍🏫</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Coaches</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.usersByRole?.coach || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">📈</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">New This Month</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.recentRegistrations || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">🔗</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Strava Connected</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">
                      {users.filter(u => u.stravaConnected).length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {users.length > 0 ? Math.round((users.filter(u => u.stravaConnected).length / users.length) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">📱</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Mobile App Users</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{mobileAppStats.withApp}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {mobileAppStats.active7d} active (7d) · iOS {mobileAppStats.ios} · Android {mobileAppStats.android}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">📊</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Avg Tests/User</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">
                      {users.length > 0 
                        ? (users.reduce((sum, u) => sum + (u.testCount || 0), 0) / users.length).toFixed(1)
                        : '0'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">🏋️</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Avg Trainings/User</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">
                      {users.length > 0 
                        ? (users.reduce((sum, u) => sum + (u.trainingCount || 0), 0) / users.length).toFixed(1)
                        : '0'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-cyan-100 rounded-lg">
                    <span className="text-xl sm:text-2xl">✅</span>
                  </div>
                  <div className="ml-3 sm:ml-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Active Users</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">
                      {users.filter(u => (u.trainingCount || 0) > 0 || (u.testCount || 0) > 0).length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {users.length > 0 
                        ? Math.round((users.filter(u => (u.trainingCount || 0) > 0 || (u.testCount || 0) > 0).length / users.length) * 100)
                        : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Unit System Distribution */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Unit System Distribution</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600">{unitStats.metric}</p>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Metric</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {unitStats.total > 0 ? Math.round((unitStats.metric / unitStats.total) * 100) : 0}%
                  </p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600">{unitStats.imperial}</p>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Imperial</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {unitStats.total > 0 ? Math.round((unitStats.imperial / unitStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Last Login Statistics */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">User Activity (Last Login)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{lastLoginStats.last24h}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Last 24h</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">{lastLoginStats.last7d}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Last 7 days</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-yellow-600">{lastLoginStats.last30d}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Last 30 days</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-red-600">{lastLoginStats.never}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Never</p>
                  {lastLoginStats.never > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const neverLoggedInUsers = users.filter(u => !u.lastLogin && u.email && u.notifications?.emailNotifications !== false);
                        if (neverLoggedInUsers.length === 0) {
                          addNotification('No users available for reactivation email (no email or email notifications disabled)', 'warning');
                          return;
                        }
                        if (!window.confirm(`Send reactivation email to ${neverLoggedInUsers.length} user(s) who never logged in?`)) {
                          return;
                        }
                        setSendingToAll(true);
                        let successCount = 0;
                        let failCount = 0;
                        for (const targetUser of neverLoggedInUsers) {
                          try {
                            await sendReactivationEmail(targetUser._id);
                            successCount++;
                            // Small delay between emails
                            await new Promise(resolve => setTimeout(resolve, 500));
                          } catch (err) {
                            console.error(`Failed to send reactivation email to ${targetUser.email}:`, err);
                            failCount++;
                          }
                        }
                        setSendingToAll(false);
                        addNotification(`Sent ${successCount} reactivation email(s)${failCount > 0 ? `, ${failCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
                      }}
                      disabled={sendingToAll || lastLoginStats.never === 0}
                      className={`mt-2 px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        sendingToAll || lastLoginStats.never === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {sendingToAll ? 'Sending...' : 'Send reactivation email'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sports Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Users by Sport</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {Object.entries(stats?.usersBySport || {}).map(([sport, count]) => (
                  <div key={sport} className="text-center">
                      <p className="text-xl sm:text-2xl font-bold text-primary">{count}</p>
                      <p className="text-xs sm:text-sm text-gray-600 capitalize">{sport}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tests by Sport */}
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Tests by Sport</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-blue-600">{stats?.testsBySport?.run || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Run</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-green-600">{stats?.testsBySport?.bike || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Bike</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.testsBySport?.swim || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Swim</p>
                  </div>
                  <div className="text-center col-span-2 sm:col-span-1">
                    <p className="text-xl sm:text-2xl font-bold text-primary">{stats?.testsBySport?.total || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Total</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Users by Country */}
            {stats?.usersByCountry && Object.keys(stats.usersByCountry).filter(c => c !== 'Unknown').length > 0 && (
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Users by Country</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {Object.entries(stats.usersByCountry)
                    .sort((a, b) => b[1] - a[1])
                    .map(([country, count]) => (
                      <div key={country} className="text-center p-2 rounded-lg bg-gray-50">
                        <p className="text-xl sm:text-2xl font-bold text-sky-600">{count}</p>
                        <p className="text-xs sm:text-sm text-gray-600">{country}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'health' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {(() => {
              const webhook = adminHealth?.strava?.webhookSubscription || {};
              const budget = adminHealth?.strava?.budget || {};
              const counts = adminHealth?.strava?.counts || {};
              const webhookBroken = ['dead', 'error'].includes(webhook.state);
              const dbConnected = adminHealth?.database?.stateLabel === 'connected';
              const budgetPct = budget.windowLimit ? Math.round((Number(budget.windowUsed || 0) / Number(budget.windowLimit)) * 100) : 0;
              const cards = [
                {
                  label: 'API / DB',
                  value: dbConnected ? 'Healthy' : (adminHealth?.database?.stateLabel || 'Unknown'),
                  detail: `uptime ${Math.round((adminHealth?.app?.uptimeSeconds || 0) / 60)} min`,
                  tone: dbConnected ? 'green' : 'red',
                },
                {
                  label: 'Strava webhook',
                  value: webhookBroken ? 'Needs attention' : (webhook.state || 'Unknown'),
                  detail: webhook.callbackUrl || webhook.message || 'No callback reported',
                  tone: webhookBroken ? 'red' : webhook.state === 'active' ? 'green' : 'amber',
                },
                {
                  label: 'Strava budget',
                  value: budget.windowLimit ? `${budget.windowUsed || 0}/${budget.windowLimit}` : 'Unknown',
                  detail: `${budgetPct}% of current 15-min window`,
                  tone: budgetPct > 80 ? 'red' : budgetPct > 60 ? 'amber' : 'green',
                },
                {
                  label: '24h sync health',
                  value: `${counts.failures24h || 0} failures`,
                  detail: `${counts.syncs24h || 0} sync logs, ${counts.rateLimits24h || 0} rate limits`,
                  tone: counts.failures24h > 0 || counts.rateLimits24h > 0 ? 'amber' : 'green',
                },
              ];
              const toneClass = (tone) => {
                if (tone === 'red') return 'border-red-200 bg-red-50 text-red-800';
                if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-800';
                return 'border-green-200 bg-green-50 text-green-800';
              };

              return (
                <>
                  <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">System Health</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Strava sync, webhook, rate-limit and import diagnostics for support.
                        </p>
                      </div>
                      <button
                        onClick={fetchData}
                        className="px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                      >
                        Refresh health
                      </button>
                    </div>
                    {webhookBroken && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <div className="font-semibold">Strava real-time webhook is not working.</div>
                        <div className="mt-1">{webhook.message || 'Webhook bootstrap failed.'}</div>
                        <div className="mt-1 font-medium">
                          Check backend env vars `SERVER_PUBLIC_URL` or `STRAVA_WEBHOOK_CALLBACK_URL`, then restart the server.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {cards.map((card) => (
                      <div key={card.label} className={`rounded-xl border p-4 ${toneClass(card.tone)}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                        <p className="text-xl font-bold mt-1">{card.value}</p>
                        <p className="text-xs mt-2 break-all">{card.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                      <h4 className="font-semibold text-gray-900 mb-3">Strava Users</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Active users</span><span className="font-semibold">{counts.activeUsers || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Connected</span><span className="font-semibold">{counts.connectedUsers || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Auto-sync enabled</span><span className="font-semibold">{counts.autoSyncUsers || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Last success</span><span className="font-semibold">{formatAdminHealthTime(adminHealth?.strava?.lastSuccessfulSyncAt)}</span></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 sm:p-6 lg:col-span-2">
                      <h4 className="font-semibold text-gray-900 mb-3">Deploy / Runtime</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-gray-500">Environment:</span> <span className="font-mono">{adminHealth?.app?.environment || 'unknown'}</span></div>
                        <div><span className="text-gray-500">Commit:</span> <span className="font-mono break-all">{adminHealth?.app?.commit || 'not reported'}</span></div>
                        <div><span className="text-gray-500">DB:</span> <span className="font-mono">{adminHealth?.database?.name || 'unknown'} ({adminHealth?.database?.stateLabel || 'unknown'})</span></div>
                        <div><span className="text-gray-500">Generated:</span> {adminHealth?.generatedAt ? new Date(adminHealth.generatedAt).toLocaleString() : 'unknown'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                      <h4 className="font-semibold text-gray-900">Recent Strava Sync Logs</h4>
                      <p className="text-sm text-gray-500 mt-1">Manual sync, webhook imports, scheduler runs and rate-limit events.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Time', 'User', 'Source', 'Status', 'Imported', 'Updated', 'Error'].map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(adminHealth?.recentLogs || []).map((log) => (
                            <tr key={log._id}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatAdminHealthTime(log.createdAt)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{healthUserName(log)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{log.source}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  log.status === 'success' ? 'bg-green-100 text-green-800' :
                                  log.status === 'rate_limited' ? 'bg-amber-100 text-amber-800' :
                                  log.status === 'partial' ? 'bg-blue-100 text-blue-800' :
                                  log.status === 'skipped' ? 'bg-gray-100 text-gray-700' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{log.imported || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{log.updated || 0}</td>
                              <td className="px-4 py-3 text-sm text-red-700 max-w-md truncate" title={log.error || log.message || ''}>{log.error || log.message || '-'}</td>
                            </tr>
                          ))}
                          {(!adminHealth?.recentLogs || adminHealth.recentLogs.length === 0) && (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No Strava sync logs recorded yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-white rounded-lg shadow overflow-hidden -mx-4 sm:mx-0">
              <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div>
                      <h3 className="text-sm sm:text-lg font-semibold text-gray-900">User Management</h3>
                      <p className="text-xs sm:text-sm text-gray-600">Manage user accounts and permissions</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button
                        onClick={handleSendThankYouEmailToAll}
                        disabled={sendingToAll || users.length === 0}
                        className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                          sendingToAll || users.length === 0
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {sendingToAll ? 'Sending...' : `Send to All (${users.length})`}
                      </button>
                      <div className="flex-1 sm:flex-initial sm:max-w-xs">
                        <input
                          type="text"
                          placeholder="Search by email or name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Strava:</label>
                        <select
                          value={stravaFilter}
                          onChange={(e) => setStravaFilter(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="all">All</option>
                          <option value="connected">Connected</option>
                          <option value="notConnected">Not Connected</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Mobile app:</label>
                        <select
                          value={mobileAppFilter}
                          onChange={(e) => setMobileAppFilter(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="all">All</option>
                          <option value="hasApp">Has app ({mobileAppStats.withApp})</option>
                          <option value="active7d">Active 7d ({mobileAppStats.active7d})</option>
                          <option value="noApp">No app</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Premium:</label>
                        <select
                          value={premiumFilter}
                          onChange={(e) => setPremiumFilter(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          title="Filter users by premium access state"
                        >
                          <option value="all">All ({premiumCounts.all})</option>
                          <option value="any">Any premium ({premiumCounts.any})</option>
                          <option value="paid">Paid ({premiumCounts.paid})</option>
                          <option value="trial">Trial ({premiumCounts.trial})</option>
                          <option value="manual">Manual grant ({premiumCounts.manual})</option>
                          <option value="free">Free only ({premiumCounts.free})</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Show:</label>
                      <select
                        value={usersLimit}
                        onChange={(e) => setUsersLimit(Number(e.target.value))}
                        className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={users.length}>All ({users.length})</option>
                      </select>
                    </div>
                    {stravaFilter === 'notConnected' && (
                      <button
                        onClick={async () => {
                          const notConnectedUsers = filteredUsers.filter(u => !u.stravaConnected && u.email);
                          if (notConnectedUsers.length === 0) {
                            addNotification('No users without Strava connection found', 'warning');
                            return;
                          }
                          if (!window.confirm(`Send Strava reminder emails to ${notConnectedUsers.length} users?`)) {
                            return;
                          }
                          setBulkSending(true);
                          let successCount = 0;
                          let failCount = 0;
                          for (const user of notConnectedUsers) {
                            try {
                              await sendStravaReminderEmail(user._id);
                              successCount++;
                              await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (err) {
                              failCount++;
                            }
                          }
                          setBulkSending(false);
                          addNotification(`Strava reminder emails sent: ${successCount} successful, ${failCount} failed`, successCount > 0 ? 'success' : 'error');
                        }}
                        disabled={bulkSending}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                          bulkSending
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-orange-600 text-white hover:bg-orange-700'
                        }`}
                      >
                        {bulkSending ? 'Sending...' : `Send Reminders to All (${filteredUsers.filter(u => !u.stravaConnected && u.email).length})`}
                      </button>
                    )}
                    <div className="text-xs text-gray-500">
                      Showing {filteredUsers.length} of {users.filter(u => {
                        if (!searchQuery.trim()) return true;
                        const query = searchQuery.toLowerCase();
                        const email = (u.email || '').toLowerCase();
                        const name = `${u.name || ''} ${u.surname || ''}`.toLowerCase();
                        return email.includes(query) || name.includes(query);
                      }).length} users
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Mobile Card View */}
              <div className="block md:hidden divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    {searchQuery ? `No users found matching "${searchQuery}"` : 'No users found'}
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                  <div key={user._id} className="p-3 hover:bg-gray-50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center flex-1 min-w-0 pr-2">
                        <div className="flex-shrink-0 h-8 w-8">
                          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                            <span className="text-white font-medium text-xs">
                              {user.name?.[0]}{user.surname?.[0]}
                            </span>
                          </div>
                        </div>
                        <div className="ml-2 min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {user.name} {user.surname}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{user.email}</div>
                        </div>
                    </div>
                    <button
                      onClick={() => setEditingUser(user)}
                      className="flex-shrink-0 px-2 py-1 text-xs font-medium text-primary hover:text-primary-dark border border-primary rounded hover:bg-primary/5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleImpersonate(user)}
                      className="ml-1 flex-shrink-0 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-500 rounded hover:bg-amber-50"
                      title="Login as this user"
                    >
                      Login as user
                    </button>
                    <button
                      onClick={() => handleUserUpdate(user._id, { premium: !user.premium })}
                      className={`ml-1 flex-shrink-0 px-2 py-1 text-xs font-medium rounded border ${
                        user.premium
                          ? 'text-amber-900 bg-amber-100 border-amber-500 hover:bg-amber-200'
                          : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title={user.premium ? 'Revoke manual premium access' : 'Grant manual premium access'}
                    >
                      {user.premium ? '★ Premium' : '☆ Grant Premium'}
                    </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-red-100 text-red-800' :
                        user.role === 'coach' ? 'bg-purple-100 text-purple-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role}
                        {user.admin && ' (Admin)'}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {(() => {
                        // Single source of truth for "is this user paying?"
                        // We prefer the server-resolved premiumSource so the
                        // badge accurately reflects how access was granted:
                        //   manual       — admin clicked ★ Grant Premium
                        //   subscription — active Stripe sub (trialing / active)
                        //   beta         — BETA_ALL_PREMIUM env override
                        //   none         — free user
                        const source = user.premiumSource;
                        const sub = user.subscription;
                        if (source === 'manual') {
                          return (
                            <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900" title="Manually granted by admin">
                              ★ Premium (manual)
                            </span>
                          );
                        }
                        if (source === 'subscription' && sub) {
                          const planLabel = sub.plan
                            ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)
                            : 'Paid';
                          const isTrial = sub.status === 'trialing';
                          const trialEndStr = isTrial && sub.trialEnd
                            ? new Date(sub.trialEnd).toLocaleDateString()
                            : null;
                          return (
                            <span
                              className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                                isTrial
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-green-100 text-green-900'
                              }`}
                              title={isTrial
                                ? `Free trial${trialEndStr ? ` until ${trialEndStr}` : ''}`
                                : `Active paid subscription`}
                            >
                              {isTrial ? '🎁' : '✓'} {planLabel}{isTrial ? ' (trial)' : ''}
                            </span>
                          );
                        }
                        if (source === 'beta') {
                          return (
                            <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-900" title="BETA_ALL_PREMIUM env override">
                              β Beta-all
                            </span>
                          );
                        }
                        if (source === 'system_disabled') {
                          return (
                            <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-800" title="SUBSCRIPTION_ENABLED is off — paywall disabled for everyone">
                              ⚙︎ System off
                            </span>
                          );
                        }
                        // Free user — show explicit "Free" chip so the column
                        // never looks empty (was confusing during testing).
                        return (
                          <span className="inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600" title="No premium access">
                            Free
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                        user.notifications?.emailNotifications === false
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        Email: {user.notifications?.emailNotifications === false ? 'OFF' : 'ON'}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                        user.notifications?.weeklyReports === false
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        Weekly: {user.notifications?.weeklyReports === false ? 'OFF' : 'ON'}
                      </span>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-1.5 text-center">
                        <div>
                          <div className="text-xs text-gray-500">Sport</div>
                          <div className="text-xs font-medium text-gray-900 capitalize mt-0.5 truncate">{user.sport || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Trainings</div>
                          <div className="text-base font-semibold text-blue-600 mt-0.5">{user.trainingCount || 0}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-center mt-2">
                        <div>
                          <div className="text-xs text-gray-500">Tests</div>
                          <div className="text-base font-semibold text-purple-600 mt-0.5">
                            {user.testCount !== undefined && user.testCount !== null ? user.testCount : 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Logins</div>
                          <div className="text-base font-semibold text-gray-900 mt-0.5">
                            {user.loginCount !== undefined && user.loginCount !== null ? user.loginCount : 0}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-500 text-center mb-1">Last Login</div>
                        <div className="text-xs font-medium text-gray-900 text-center">
                          {user.lastLogin ? (
                            <>
                              <div>{new Date(user.lastLogin).toLocaleDateString()}</div>
                              <div className="text-gray-500">{new Date(user.lastLogin).toLocaleTimeString()}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">Never</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-500 text-center mb-1">Thank You Email</div>
                        <div className="text-xs font-medium text-center">
                          {user.thankYouEmail?.sent ? (
                            <>
                              <span className="inline-flex px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-800">
                                ✓ Sent ({user.thankYouEmail.sentCount || 0}x)
                              </span>
                              {user.thankYouEmail.lastSent && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {new Date(user.thankYouEmail.lastSent).toLocaleDateString()}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">
                              Not sent
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-center gap-2 text-xs flex-wrap">
                        {user.registrationLocation?.country && (
                          <span className="inline-flex px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-800">
                            {user.registrationLocation.countryCode && (
                              <img
                                src={`https://flagcdn.com/16x12/${user.registrationLocation.countryCode.toLowerCase()}.png`}
                                alt=""
                                className="inline mr-1 align-baseline"
                                width="16"
                                height="12"
                              />
                            )}
                            {user.registrationLocation.city || user.registrationLocation.country}
                          </span>
                        )}
                        {user.lastLoginLocation?.country && (
                          <span className="inline-flex px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800">
                            Last login from: {user.lastLoginLocation.city || user.lastLoginLocation.country}
                          </span>
                        )}
                        <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${
                          user.stravaConnected ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          Strava: {user.stravaConnected ? 'Connected' : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="text-gray-500">App:</span>
                          {renderMobileAppBadge(user, { compact: true })}
                        </span>
                        {user.hasMobileApp && user.mobileAppLastSeen && (
                          <span className="text-gray-400">
                            App last seen: {new Date(user.mobileAppLastSeen).toLocaleDateString()}
                          </span>
                        )}
                        {!user.stravaConnected && user.stravaReminderEmail?.sent && user.stravaReminderEmail.lastSent && (
                          <span className="text-gray-400">
                            Reminder: {new Date(user.stravaReminderEmail.lastSent).toLocaleDateString()}{' '}
                            {new Date(user.stravaReminderEmail.lastSent).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {user.lastLogin && (
                          <span className="text-gray-400">
                            Last login: {new Date(user.lastLogin).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {user.role === 'coach' && (
                        <>
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="text-xs text-gray-500 text-center mb-1">Athletes</div>
                            <div className="text-base font-semibold text-indigo-600 text-center">
                              {user.athletesCount !== undefined ? user.athletesCount : 0}
                            </div>
                            {user.athletes && user.athletes.length > 0 && (
                              <details className="mt-1">
                                <summary className="text-xs text-gray-500 text-center cursor-pointer hover:text-gray-700">
                                  View athletes ({user.athletesCount !== undefined ? user.athletesCount : (coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => a.hasPassword).length})
                                </summary>
                                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                  {(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => a.hasPassword).map((athlete) => (
                                    <div key={athlete._id} className="text-xs text-gray-700 px-2 py-1 bg-gray-50 rounded">
                                      <div className="font-medium">{athlete.name} {athlete.surname}</div>
                                      {athlete.email && (
                                        <div className="text-gray-500 text-[10px] truncate">{athlete.email}</div>
                                      )}
                                      {athlete.sport && (
                                        <div className="text-gray-500 text-[10px] capitalize">{athlete.sport}</div>
                                      )}
                                      <div className="flex gap-2 mt-1 text-[10px]">
                                        <span className="text-blue-600 font-semibold">Trainings: {athlete.trainingCount || 0}</span>
                                        <span className="text-purple-600 font-semibold">Tests: {athlete.testCount || 0}</span>
                                      </div>
                                      {(athlete.lastLogin || athlete.createdAt) && (
                                        <div className="text-gray-500 text-[10px] mt-1">
                                          {athlete.lastLogin ? 'Last login:' : 'Registered:'} {new Date(athlete.lastLogin || athlete.createdAt).toLocaleDateString()}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => !a.hasPassword).length > 0 && (
                                    <div className="text-[10px] text-gray-400 italic text-center pt-1">
                                      +{(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => !a.hasPassword).length} without password
                                    </div>
                                  )}
                                </div>

                                {(() => {
                                  const loadedCount = (coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).length;
                                  const totalLinked = coachAthletesByCoachId[user._id]?.totalLinked ?? user.athletesLinkedCount ?? 0;
                                  if (!totalLinked || loadedCount >= totalLinked) return null;
                                  return (
                                    <button
                                      type="button"
                                      className="mt-2 w-full px-2 py-1.5 text-[10px] rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                                      disabled={coachAthletesLoadingByCoachId[user._id]}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleLoadMoreCoachAthletes(user);
                                      }}
                                    >
                                      {coachAthletesLoadingByCoachId[user._id] ? 'Loading...' : 'Load more'}
                                    </button>
                                  );
                                })()}
                              </details>
                            )}
                          </div>
                        <div className="text-xs text-gray-400 mt-1.5 text-center">
                          Tests include athletes + own
                        </div>
                        </>
                      )}
                      <div className="mt-2 flex flex-col gap-2">
                        {!user.stravaConnected && (
                          <button
                            type="button"
                            disabled={stravaReminderEmailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                            onClick={() => handleSendStravaReminderEmail(user)}
                            className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center gap-1.5 ${
                              user.notifications?.emailNotifications === false
                                ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                                : 'border-orange-500 text-orange-600 hover:bg-orange-50'
                            } ${stravaReminderEmailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                          >
                            <span>🔗</span>
                            {stravaReminderEmailLoadingUserId === user._id ? 'Sending…' : `Send Strava reminder${user.stravaReminderEmail?.sent ? ` (${user.stravaReminderEmail.sentCount || 1}x)` : ''}`}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={appDownloadEmailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                          onClick={() => handleSendAppDownloadEmail(user)}
                          className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center gap-1.5 ${
                            user.notifications?.emailNotifications === false
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                              : 'border-blue-500 text-blue-600 hover:bg-blue-50'
                          } ${appDownloadEmailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                        >
                          <span>📲</span>
                          {appDownloadEmailLoadingUserId === user._id ? 'Sending…' : `Send app download${user.appDownloadEmail?.sent ? ` (${user.appDownloadEmail.sentCount || 1}x)` : ''}`}
                        </button>
                        <button
                          type="button"
                          disabled={emailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                          onClick={() => handleSendReactivationEmail(user)}
                          className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center ${
                            user.notifications?.emailNotifications === false
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                              : 'border-primary text-primary hover:bg-primary/5'
                          } ${emailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                        >
                          {emailLoadingUserId === user._id ? 'Sending…' : 'Send reactivation email'}
                        </button>
                        <button
                          type="button"
                          disabled={thankYouEmailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                          onClick={() => handleSendThankYouEmail(user)}
                          className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center ${
                            user.notifications?.emailNotifications === false
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                              : 'border-green-600 text-green-600 hover:bg-green-50'
                          } ${thankYouEmailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                        >
                          {thankYouEmailLoadingUserId === user._id ? 'Sending…' : 'Send thank you email'}
                        </button>
                        {(user.role === 'athlete' || (user.athletes && user.athletes.length > 0)) && (
                          <button
                            type="button"
                            disabled={deleteAthleteLoadingId === user._id || currentUser?.id === user._id || currentUser?._id === user._id}
                            onClick={() => handleDeleteAthleteWithTests(user)}
                            className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center ${
                              currentUser?.id === user._id || currentUser?._id === user._id
                                ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                                : 'border-orange-600 text-orange-600 hover:bg-orange-50'
                            } ${deleteAthleteLoadingId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                            title="Delete athlete with all tests (for problematic athletes causing freeze)"
                          >
                            {deleteAthleteLoadingId === user._id ? 'Deleting…' : 'Delete athlete'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deleteLoadingUserId === user._id || currentUser?.id === user._id || currentUser?._id === user._id}
                          onClick={() => handleDeleteUser(user)}
                          className={`w-full border text-xs font-medium py-1.5 rounded-md flex items-center justify-center ${
                            currentUser?.id === user._id || currentUser?._id === user._id
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                              : 'border-red-600 text-red-600 hover:bg-red-50'
                          } ${deleteLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                        >
                          {deleteLoadingUserId === user._id ? 'Deleting…' : 'Delete user'}
                        </button>
                      </div>
                    </div>
                  </div>
                  ))
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sport</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trainings</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tests</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logins</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strava</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile App</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thank You Email</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan="14" className="px-4 lg:px-6 py-8 text-center text-gray-500">
                            {searchQuery ? `No users found matching "${searchQuery}"` : 'No users found'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                        <tr key={user._id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                                  <span className="text-white font-medium text-sm">
                                    {user.name?.[0]}{user.surname?.[0]}
                                  </span>
                                </div>
                              </div>
                              <div className="ml-4 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.name} {user.surname}
                                </div>
                                <div className="text-sm text-gray-500 truncate">{user.email}</div>
                                {user.role === 'coach' && user._id && (
                                  <div className="text-xs text-gray-400 mt-0.5">ID: {user._id.substring(0, 8)}...</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.role === 'admin' ? 'bg-red-100 text-red-800' :
                              user.role === 'coach' ? 'bg-purple-100 text-purple-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {user.role}
                              {user.admin && ' (Admin)'}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-gray-900 capitalize">
                            <div>{user.sport || 'Not specified'}</div>
                            {user.role === 'coach' && user.athletesCount !== undefined && (
                              <div className="mt-1">
                                <div className="text-xs font-semibold text-indigo-600">
                                  Athletes: {user.athletesCount}
                                </div>
                                {user.athletes && user.athletes.length > 0 && (
                                  <details className="mt-1">
                                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                      View athletes ({user.athletesCount !== undefined ? user.athletesCount : (coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => a.hasPassword).length})
                                    </summary>
                                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                      {(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => a.hasPassword).map((athlete) => (
                                        <div key={athlete._id} className="text-xs text-gray-700 px-2 py-1 bg-gray-50 rounded border border-gray-200">
                                          <div className="font-medium">{athlete.name} {athlete.surname}</div>
                                          {athlete.email && (
                                            <div className="text-gray-500 text-[10px] truncate">{athlete.email}</div>
                                          )}
                                          {athlete.sport && (
                                            <div className="text-gray-500 text-[10px] capitalize">Sport: {athlete.sport}</div>
                                          )}
                                          <div className="flex gap-3 mt-1 text-[10px]">
                                            <span className="text-blue-600 font-semibold">Trainings: {athlete.trainingCount || 0}</span>
                                            <span className="text-purple-600 font-semibold">Tests: {athlete.testCount || 0}</span>
                                          </div>
                                          {(athlete.lastLogin || athlete.createdAt) && (
                                            <div className="text-gray-500 text-[10px] mt-1">
                                              {athlete.lastLogin ? 'Last login:' : 'Registered:'} {new Date(athlete.lastLogin || athlete.createdAt).toLocaleDateString()}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      {(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => !a.hasPassword).length > 0 && (
                                        <div className="text-[10px] text-gray-400 italic text-center pt-1">
                                          +{(coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).filter(a => !a.hasPassword).length} without password (not counted)
                                        </div>
                                      )}
                                    </div>

                                    {(() => {
                                      const loadedCount = (coachAthletesByCoachId[user._id]?.athletes ?? user.athletes ?? []).length;
                                      const totalLinked = coachAthletesByCoachId[user._id]?.totalLinked ?? user.athletesLinkedCount ?? 0;
                                      if (!totalLinked || loadedCount >= totalLinked) return null;
                                      return (
                                        <button
                                          type="button"
                                          className="mt-2 w-full px-2 py-1.5 text-[10px] rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                                          disabled={coachAthletesLoadingByCoachId[user._id]}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleLoadMoreCoachAthletes(user);
                                          }}
                                        >
                                          {coachAthletesLoadingByCoachId[user._id] ? 'Loading...' : 'Load more'}
                                        </button>
                                      );
                                    })()}
                                  </details>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-sm text-gray-900">
                            <div className="flex items-center">
                              <span className="text-base lg:text-lg font-semibold text-blue-600">{user.trainingCount || 0}</span>
                              <span className="ml-1 text-xs text-gray-500">trainings</span>
                            </div>
                          </td>
                          <td className="p-2 text-sm text-gray-900">
                            <div className="flex flex-col">
                            <div className="flex items-center">
                              <span className="text-base lg:text-lg font-semibold text-purple-600">
                                {user.testCount !== undefined && user.testCount !== null ? user.testCount : 0}
                              </span>
                              <span className="ml-1 text-xs text-gray-500">tests</span>
                              </div>
                              {user.role === 'coach' && (
                                <span className="text-xs text-gray-400 mt-0.5">(athletes + own)</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-sm text-gray-900">
                            <span className="text-base lg:text-lg font-semibold text-gray-900">
                              {user.loginCount !== undefined && user.loginCount !== null ? user.loginCount : 0}
                            </span>
                          </td>
                          <td className="p-2 text-sm text-gray-900">
                            {user.lastLogin ? (
                              <div>
                                <div className="text-sm font-medium">
                                  {new Date(user.lastLogin).toLocaleDateString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(user.lastLogin).toLocaleTimeString()}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Never</span>
                            )}
                          </td>
                          <td className="p-2 text-sm">
                            {user.registrationLocation?.country || user.lastLoginLocation?.country ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900" title={user.registrationLocation?.ip || user.lastLoginLocation?.ip}>
                                  {(user.registrationLocation?.countryCode || user.lastLoginLocation?.countryCode) && (
                                    <img
                                      src={`https://flagcdn.com/16x12/${String(user.registrationLocation?.countryCode || user.lastLoginLocation?.countryCode).toLowerCase()}.png`}
                                      alt={user.registrationLocation?.countryCode || user.lastLoginLocation?.countryCode}
                                      className="inline mr-1 align-baseline"
                                      width="16"
                                      height="12"
                                    />
                                  )}
                                  {user.registrationLocation?.country || user.lastLoginLocation?.country}
                                </span>
                                {(user.registrationLocation?.city || user.lastLoginLocation?.city) && (
                                  <span className="text-xs text-gray-500">
                                    {user.registrationLocation?.city || user.lastLoginLocation?.city}
                                  </span>
                                )}
                                {user.lastLoginLocation?.resolvedAt && (
                                  <span className="text-[11px] text-indigo-500">
                                    Last login loc: {new Date(user.lastLoginLocation.resolvedAt).toLocaleDateString()} {new Date(user.lastLoginLocation.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-xs">—</span>
                            )}
                          </td>
                          <td className="p-2 text-sm">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit ${
                                  user.stravaConnected ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {user.stravaConnected ? 'Connected' : '—'}
                              </span>
                              {user.stravaConnected && user.strava?.lastSyncDate && (
                                <div className="text-xs text-gray-400">
                                  Sync: {new Date(user.strava.lastSyncDate).toLocaleDateString()}
                                </div>
                              )}
                              {!user.stravaConnected && (
                                <>
                                  {user.stravaReminderEmail?.sent && user.stravaReminderEmail.lastSent && (
                                    <div className="text-[11px] text-gray-400">
                                      Reminder:{' '}
                                      {new Date(user.stravaReminderEmail.lastSent).toLocaleDateString()}{' '}
                                      {new Date(user.stravaReminderEmail.lastSent).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  )}
                                  {user.email && (
                                    <button
                                      onClick={() => handleSendStravaReminderEmail(user)}
                                      disabled={stravaReminderEmailLoadingUserId === user._id}
                                      className={`mt-0.5 text-xs px-2 py-1 rounded ${
                                        stravaReminderEmailLoadingUserId === user._id
                                          ? 'text-gray-400 cursor-wait'
                                          : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                                      } transition-colors`}
                                      title="Send Strava connection reminder email"
                                    >
                                      {stravaReminderEmailLoadingUserId === user._id ? 'Sending...' : 'Send reminder'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-sm">
                            <div className="flex flex-col gap-1">
                              {renderMobileAppBadge(user)}
                              {user.hasMobileApp && user.mobileAppLastSeen && (
                                <div className="text-xs text-gray-500">
                                  Last seen: {new Date(user.mobileAppLastSeen).toLocaleDateString()}{' '}
                                  {new Date(user.mobileAppLastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                              {user.hasMobileApp && user.mobileAppFirstSeen && (
                                <div className="text-[11px] text-gray-400">
                                  First seen: {new Date(user.mobileAppFirstSeen).toLocaleDateString()}
                                </div>
                              )}
                              {user.pushTokenCount > 0 && (
                                <div className="text-[11px] text-gray-400">
                                  Push tokens: {user.pushTokenCount}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-sm">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit ${
                                user.notifications?.emailNotifications === false
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                Email: {user.notifications?.emailNotifications === false ? 'OFF' : 'ON'}
                              </span>
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit ${
                                user.notifications?.weeklyReports === false
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                Weekly: {user.notifications?.weeklyReports === false ? 'OFF' : 'ON'}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-sm">
                            <div className="flex flex-col gap-1">
                              {user.thankYouEmail?.sent ? (
                                <>
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit bg-green-100 text-green-800">
                                    ✓ Sent ({user.thankYouEmail.sentCount || 0}x)
                                  </span>
                                  {user.thankYouEmail.lastSent && (
                                    <span className="text-xs text-gray-500">
                                      {new Date(user.thankYouEmail.lastSent).toLocaleDateString()} {new Date(user.thankYouEmail.lastSent).toLocaleTimeString()}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit bg-gray-100 text-gray-600">
                                  Not sent
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {user.isActive ? 'Active' : 'Inactive'}
                              </span>
                              {(() => {
                                // Same logic as the card view above — mirror
                                // it in the desktop table so the source of
                                // premium access is visible at a glance.
                                const source = user.premiumSource;
                                const sub = user.subscription;
                                if (source === 'manual') {
                                  return (
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-900" title="Manually granted by admin">
                                      ★ Premium (manual)
                                    </span>
                                  );
                                }
                                if (source === 'subscription' && sub) {
                                  const planLabel = sub.plan
                                    ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)
                                    : 'Paid';
                                  const isTrial = sub.status === 'trialing';
                                  const trialEndStr = isTrial && sub.trialEnd
                                    ? new Date(sub.trialEnd).toLocaleDateString()
                                    : null;
                                  return (
                                    <span
                                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        isTrial ? 'bg-blue-100 text-blue-900' : 'bg-green-100 text-green-900'
                                      }`}
                                      title={isTrial
                                        ? `Free trial${trialEndStr ? ` until ${trialEndStr}` : ''}`
                                        : 'Active paid subscription'}
                                    >
                                      {isTrial ? '🎁' : '✓'} {planLabel}{isTrial ? ' (trial)' : ''}
                                    </span>
                                  );
                                }
                                if (source === 'beta') {
                                  return (
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-900" title="BETA_ALL_PREMIUM env override">
                                      β Beta-all
                                    </span>
                                  );
                                }
                                if (source === 'system_disabled') {
                                  return (
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800" title="SUBSCRIPTION_ENABLED is off — paywall disabled for everyone">
                                      ⚙︎ System off
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600" title="No premium access">
                                    Free
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm font-medium space-y-2">
                            <button
                              onClick={() => setEditingUser(user)}
                              className="block text-primary hover:text-primary-dark"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleImpersonate(user)}
                              className="block text-xs text-amber-700 hover:text-amber-800"
                              title="Login as this user"
                            >
                              Login as user
                            </button>
                            <button
                              type="button"
                              disabled={emailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                              onClick={() => handleSendReactivationEmail(user)}
                              className={`block text-xs ${
                                user.notifications?.emailNotifications === false
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-emerald-600 hover:text-emerald-700'
                              } ${emailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                            >
                              {emailLoadingUserId === user._id ? 'Sending…' : 'Send reactivation email'}
                            </button>
                            <button
                              type="button"
                              disabled={thankYouEmailLoadingUserId === user._id || user.notifications?.emailNotifications === false}
                              onClick={() => handleSendThankYouEmail(user)}
                              className={`block text-xs ${
                                user.notifications?.emailNotifications === false
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-green-600 hover:text-green-700'
                              } ${thankYouEmailLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                            >
                              {thankYouEmailLoadingUserId === user._id ? 'Sending…' : 'Send thank you email'}
                            </button>
                            {(user.role === 'athlete' || (user.athletes && user.athletes.length > 0)) && (
                              <button
                                type="button"
                                disabled={deleteAthleteLoadingId === user._id || currentUser?.id === user._id || currentUser?._id === user._id}
                                onClick={() => handleDeleteAthleteWithTests(user)}
                                className={`block text-xs mt-1 ${
                                  currentUser?.id === user._id || currentUser?._id === user._id
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-orange-600 hover:text-orange-700'
                                } ${deleteAthleteLoadingId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                                title={currentUser?.id === user._id || currentUser?._id === user._id ? 'Cannot delete your own account' : 'Delete athlete with all tests (for problematic athletes)'}
                              >
                                {deleteAthleteLoadingId === user._id ? 'Deleting…' : 'Delete athlete'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={deleteLoadingUserId === user._id || currentUser?.id === user._id || currentUser?._id === user._id}
                              onClick={() => handleDeleteUser(user)}
                              className={`block text-xs mt-1 ${
                                currentUser?.id === user._id || currentUser?._id === user._id
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : 'text-red-600 hover:text-red-700'
                              } ${deleteLoadingUserId === user._id ? 'opacity-60 cursor-wait' : ''}`}
                              title={currentUser?.id === user._id || currentUser?._id === user._id ? 'Cannot delete your own account' : 'Permanently delete this user'}
                            >
                              {deleteLoadingUserId === user._id ? 'Deleting…' : 'Delete user'}
                            </button>
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'marketing' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            <IosLaunchJun2026Card />
            <WhatsNewMay2026Card />

            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Email Campaign Stats</h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Overview of sent campaign emails and reach.</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <div className="text-xs text-gray-600">Total users</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{emailCampaignStats.totalUsers}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{users.filter(u => u.hasPassword).length} with password set</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <div className="text-xs text-gray-600">Email eligible users</div>
                  <div className="text-2xl font-bold text-primary mt-1">{emailCampaignStats.emailEligibleUsers}</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <div className="text-xs text-gray-600">Total campaign sends</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">{emailCampaignStats.totalCampaignSends}</div>
                </div>
              </div>
              <div className="mt-6" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={emailCampaignStats.byType}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sentUsers" fill="#767EB5" name="Users reached" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="totalSent" fill="#22c55e" name="Total sent count" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Marketing Controls */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Email Marketing</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Manage and send marketing emails to users</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Email Type:</label>
                    <select
                      value={marketingEmailType}
                      onChange={(e) => {
                        setMarketingEmailType(e.target.value);
                        setSelectedUsersForBulk([]);
                      }}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="thankYou">Thank You Email</option>
                      <option value="reactivation">Reactivation Email</option>
                      <option value="featureAnnouncement">Feature Announcement</option>
                      <option value="googleLoginFix">Google Login Fix + New Features</option>
                    </select>
                    {marketingEmailType === 'featureAnnouncement' && (
                      <select
                        value={featureAnnouncementEmailType}
                        onChange={(e) => setFeatureAnnouncementEmailType(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="newFeatures">New Features</option>
                        <option value="googleLoginFix">Google Login Fix + New Features</option>
                        <option value="improvements">Improvements</option>
                        <option value="tips">Tips</option>
                        <option value="community">Community</option>
                        <option value="thresholdLogicUpdate">LT1/LT2 + Zones Update</option>
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Filter:</label>
                    <select
                      value={marketingFilter}
                      onChange={(e) => {
                        setMarketingFilter(e.target.value);
                        setSelectedUsersForBulk([]);
                      }}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="all">All Users</option>
                      <option value="notSent">Not Sent</option>
                      <option value="sent">Already Sent</option>
                      <option value="recommended">Recommended</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Search:</label>
                    <input
                      type="text"
                      value={marketingSearchQuery}
                      onChange={(e) => {
                        setMarketingSearchQuery(e.target.value);
                        setSelectedUsersForBulk([]);
                      }}
                      placeholder="Name or email..."
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick coach outreach */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Quick Coach Outreach</h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Fill name + email and send a ready-made outreach email with a link to https://lachart.net
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={outreachName}
                  onChange={(e) => setOutreachName(e.target.value)}
                  placeholder="Coach name (optional)"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="email"
                  value={outreachEmail}
                  onChange={(e) => setOutreachEmail(e.target.value)}
                  placeholder="coach@example.com"
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleSendCoachOutreachEmail}
                  disabled={outreachSending || !outreachEmail.trim()}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    outreachSending || !outreachEmail.trim()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-primary-dark'
                  }`}
                >
                  {outreachSending ? 'Sending…' : 'Send Outreach Email'}
                </button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedUsersForBulk.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm sm:text-base font-semibold text-blue-900">
                      {selectedUsersForBulk.length} user{selectedUsersForBulk.length !== 1 ? 's' : ''} selected
                    </h4>
                    <p className="text-xs sm:text-sm text-blue-700 mt-1">
                      Ready to send {marketingEmailType === 'thankYou' ? 'thank you' : marketingEmailType === 'reactivation' ? 'reactivation' : 'feature update'} emails
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={selectAllFiltered}
                      className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm hover:bg-blue-200 transition-colors"
                    >
                      Select All ({filteredMarketingUsers.length})
                    </button>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-xs sm:text-sm hover:bg-gray-200 transition-colors"
                    >
                      Clear Selection
                    </button>
                    <button
                      onClick={handleBulkSend}
                      disabled={bulkSending}
                      className={`px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                        bulkSending
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {bulkSending ? `Sending... (${selectedUsersForBulk.length})` : `Send to ${selectedUsersForBulk.length} Users`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-xs sm:text-sm font-medium text-gray-600">Total Eligible</div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{marketingUsers.length}</div>
                <div className="text-xs text-gray-500 mt-1">Users with email enabled</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-xs sm:text-sm font-medium text-gray-600">
                  {marketingEmailType === 'thankYou' ? 'Thank You Sent' : 
                   marketingEmailType === 'reactivation' ? 'Needs Reactivation' : 
                   'Feature Announcement Sent'}
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                  {marketingEmailType === 'thankYou' 
                    ? marketingUsers.filter(u => u.thankYouSent).length
                    : marketingEmailType === 'reactivation'
                    ? marketingUsers.filter(u => !u.lastLogin || new Date(u.lastLogin) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length
                    : marketingUsers.filter(u => u.featureAnnouncementSent).length
                  }
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {marketingEmailType === 'thankYou' ? 'Already sent' : 
                   marketingEmailType === 'reactivation' ? 'Inactive 30+ days' :
                   'Already sent'}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-xs sm:text-sm font-medium text-gray-600">Recommended</div>
                <div className="text-2xl sm:text-3xl font-bold text-primary mt-1">
                  {marketingEmailType === 'thankYou'
                    ? marketingUsers.filter(u => u.thankYouScore >= 50).length
                    : marketingEmailType === 'reactivation'
                    ? marketingUsers.filter(u => u.reactivationScore >= 50).length
                    : marketingUsers.filter(u => u.featureAnnouncementScore >= 50).length
                  }
                </div>
                <div className="text-xs text-gray-500 mt-1">High priority candidates</div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                  {marketingEmailType === 'thankYou' ? 'Thank You Email' : 
                   marketingEmailType === 'reactivation' ? 'Reactivation Email' :
                   marketingEmailType === 'googleLoginFix' ? 'Google Login Fix + New Features Email' :
                   'Feature Announcement Email'} Recipients
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Showing {filteredMarketingUsers.length} of {marketingUsers.length} eligible users
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={selectedUsersForBulk.length === filteredMarketingUsers.length && filteredMarketingUsers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllFiltered();
                            } else {
                              clearSelection();
                            }
                          }}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recommendation</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMarketingUsers.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                          No users found matching the selected criteria
                        </td>
                      </tr>
                    ) : (
                      filteredMarketingUsers.map((user) => {
                        const isSelected = selectedUsersForBulk.includes(user._id);
                        const score = marketingEmailType === 'thankYou' ? user.thankYouScore : 
                                     marketingEmailType === 'reactivation' ? user.reactivationScore :
                                     user.featureAnnouncementScore;
                        const reason = marketingEmailType === 'thankYou' ? user.thankYouReason : 
                                     marketingEmailType === 'reactivation' ? user.reactivationReason :
                                     user.featureAnnouncementReason;
                        
                        return (
                          <tr key={user._id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleUserSelection(user._id)}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                                    <span className="text-white font-medium text-sm">
                                      {user.name?.[0]}{user.surname?.[0]}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-4 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">
                                    {user.name} {user.surname}
                                  </div>
                                  <div className="text-sm text-gray-500 truncate">{user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {user.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {user.lastLogin ? (
                                <div>
                                  <div className="font-medium">
                                    {new Date(user.lastLogin).toLocaleDateString()}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {user.daysSinceLogin !== null ? `${user.daysSinceLogin} days ago` : ''}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">Never</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-gray-600">
                                  Tests: <span className="font-medium">{user.testCount || 0}</span>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Trainings: <span className="font-medium">{user.trainingCount || 0}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {marketingEmailType === 'thankYou' ? (
                                user.thankYouSent ? (
                                  <div>
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                      ✓ Sent ({user.thankYouEmail?.sentCount || 0}x)
                                    </span>
                                    {user.thankYouLastSent && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {new Date(user.thankYouLastSent).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                                    Not sent
                                  </span>
                                )
                              ) : isFeatureAnnouncementMode ? (
                                user.featureAnnouncementSent ? (
                                  <div>
                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                      ✓ Sent ({user.featureAnnouncementEmail?.sentCount || 0}x)
                                    </span>
                                    {user.featureAnnouncementLastSent && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {new Date(user.featureAnnouncementLastSent).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                                    Not sent
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-gray-600">N/A</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-1">
                                <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full w-fit ${
                                  score >= 80 ? 'bg-red-100 text-red-800' :
                                  score >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {score >= 80 ? '🔴 High' : score >= 50 ? '🟡 Medium' : '⚪ Low'}
                                </div>
                                <div className="text-xs text-gray-500">{reason}</div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm font-medium">
                              <button
                                type="button"
                                disabled={
                                  (marketingEmailType === 'thankYou' ? thankYouEmailLoadingUserId : 
                                   isFeatureAnnouncementMode ? featureAnnouncementEmailLoadingUserId :
                                   emailLoadingUserId) === user._id
                                }
                                onClick={() => {
                                  if (marketingEmailType === 'thankYou') {
                                    handleSendThankYouEmail(user);
                                  } else if (marketingEmailType === 'reactivation') {
                                    handleSendReactivationEmail(user);
                                  } else if (marketingEmailType === 'googleLoginFix') {
                                    handleSendFeatureAnnouncementEmail(user, 'googleLoginFix');
                                  } else {
                                    handleSendFeatureAnnouncementEmail(user);
                                  }
                                }}
                                className={`text-xs ${
                                  (marketingEmailType === 'thankYou' ? thankYouEmailLoadingUserId : 
                                   isFeatureAnnouncementMode ? featureAnnouncementEmailLoadingUserId :
                                   emailLoadingUserId) === user._id
                                    ? 'text-gray-400 cursor-wait'
                                    : marketingEmailType === 'thankYou'
                                    ? 'text-green-600 hover:text-green-700'
                                    : isFeatureAnnouncementMode
                                    ? 'text-blue-600 hover:text-blue-700'
                                    : 'text-emerald-600 hover:text-emerald-700'
                                }`}
                              >
                                {(marketingEmailType === 'thankYou' ? thankYouEmailLoadingUserId : 
                                  isFeatureAnnouncementMode ? featureAnnouncementEmailLoadingUserId :
                                  emailLoadingUserId) === user._id
                                  ? 'Sending…'
                                  : 'Send Now'
                                }
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'outreach' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Contacts', value: outreachStats.total, color: 'bg-gray-50 text-gray-700' },
                { label: 'Have Email', value: outreachStats.withEmail, color: 'bg-blue-50 text-blue-700' },
                { label: 'Contacted', value: outreachStats.contacted, color: 'bg-yellow-50 text-yellow-700' },
                { label: 'Responded', value: outreachStats.responded, color: 'bg-green-50 text-green-700' },
                { label: 'Registered', value: outreachStats.registered, color: 'bg-purple-50 text-purple-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-3 sm:p-4 ${s.color}`}>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs font-medium mt-0.5 opacity-70">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  // 'not-contacted' is now the default — it returns contacts
                  // that have an email AND haven't been logged as sent yet.
                  // That's the only actionable filter in practice.
                  { key: 'not-contacted', label: '🎯 To contact' },
                  { key: 'all', label: '🌍 All' },
                  { key: 'priority', label: '⭐ Top 10' },
                  { key: 'email-only', label: '📧 Has email' },
                  { key: 'lab', label: '🔬 Labs' },
                  { key: 'coach', label: '🏊 Coaches' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setOutreachFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      outreachFilter === f.key ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <select
                  value={outreachCountry}
                  onChange={e => setOutreachCountry(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary ml-auto"
                >
                  <option value="">All Countries</option>
                  {ALL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input
                type="text"
                value={outreachSearch}
                onChange={e => setOutreachSearch(e.target.value)}
                placeholder="Search by name, email, country…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-400">{filteredContacts.length} contacts shown</p>
            </div>

            {/* Contacts list */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              {outreachLeadsLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">Loading status…</div>
              ) : filteredContacts.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No contacts match your filters.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredContacts.map(contact => {
                    const lead = contact.lead;
                    const isSent = lead?.sentCount > 0;
                    const isResponded = lead?.responded;
                    const isRegistered = lead?.registered;
                    const statusBadge = isRegistered
                      ? { label: 'Registered 🎉', cls: 'bg-purple-100 text-purple-700' }
                      : isResponded
                      ? { label: 'Responded ✅', cls: 'bg-green-100 text-green-700' }
                      : isSent
                      ? { label: `Sent ×${lead.sentCount}`, cls: 'bg-yellow-100 text-yellow-700' }
                      : { label: 'Not contacted', cls: 'bg-gray-100 text-gray-500' };

                    return (
                      <div key={contact.id} className={`px-4 py-3 hover:bg-gray-50 flex items-start gap-3 ${
                        isRegistered ? 'border-l-2 border-purple-400' :
                        isResponded  ? 'border-l-2 border-green-400' :
                        isSent       ? 'border-l-2 border-yellow-400' : ''
                      }`}>
                        {/* Category icon */}
                        <div className="flex-shrink-0 mt-0.5 text-lg">{contact.category === 'lab' ? '🔬' : '🏊'}</div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 truncate">{contact.name}</span>
                            {contact.priority && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">⭐ Top</span>}
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{contact.country}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                          </div>
                          {contact.email
                            ? <p className="text-xs text-primary mt-0.5">{contact.email}</p>
                            : <p className="text-xs text-gray-400 mt-0.5">Contact via {contact.contactMethod === 'form' ? 'web form' : contact.contactMethod}</p>
                          }
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{contact.note}</p>
                          {isSent && lead.lastSentAt && (
                            <p className="text-xs text-gray-400 mt-0.5">Last sent: {new Date(lead.lastSentAt).toLocaleDateString()}</p>
                          )}
                          {/* Follow-up toggles */}
                          {isSent && lead?._id && (
                            <div className="flex gap-3 mt-1.5">
                              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(lead.responded)}
                                  disabled={outreachLeadUpdatingId === `${lead._id}:responded`}
                                  onChange={e => handleOutreachLeadToggle(lead._id, 'responded', e.target.checked)}
                                  className="rounded border-gray-300 text-green-600"
                                />
                                Responded
                              </label>
                              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(lead.registered)}
                                  disabled={outreachLeadUpdatingId === `${lead._id}:registered`}
                                  onChange={e => handleOutreachLeadToggle(lead._id, 'registered', e.target.checked)}
                                  className="rounded border-gray-300 text-purple-600"
                                />
                                Registered
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {contact.email ? (
                            <button
                              onClick={() => openCompose(contact)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-dark transition-colors whitespace-nowrap"
                            >
                              {isSent ? '↩ Follow-up' : '✉ Send'}
                            </button>
                          ) : (
                            <>
                              <a
                                href={contact.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap text-center"
                              >
                                🌐 Form
                              </a>
                              <button
                                onClick={() => {
                                  const { body } = buildOutreachEmail(contact);
                                  navigator.clipboard.writeText(body);
                                  setCopiedContactId(contact.id);
                                  setTimeout(() => setCopiedContactId(null), 2000);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-all"
                                title="Copy outreach message to clipboard"
                              >
                                {copiedContactId === contact.id ? '✓ Copied' : '📋 Copy msg'}
                              </button>
                            </>
                          )}
                          <a
                            href={contact.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-center text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Website ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section A: Import CSV leads ──────────────────────────────── */}
            <div className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Import Leads from CSV</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload a CSV (or TSV) file with columns: Název/Name, Email, Město/City, Země/Country, Typ/Type, Web URL/Website, Telefon/Phone, Priorita/Priority.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Choose CSV file
                  <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleCsvFileChange} />
                </label>
                {csvImportFile && <span className="text-xs text-gray-500">{csvImportFile.name}</span>}
              </div>

              {csvImportPreview && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-sm text-blue-800 font-medium">
                    Found {csvImportPreview.leads.length} rows — {csvImportPreview.withEmail} with valid email
                  </p>
                  {csvImportPreview.leads.length > 0 && (
                    <button
                      onClick={handleCsvImport}
                      disabled={csvImporting || csvImportPreview.withEmail === 0}
                      className={`mt-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        csvImporting || csvImportPreview.withEmail === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-primary text-white hover:bg-primary-dark'
                      }`}
                    >
                      {csvImporting ? 'Importing…' : `Import ${csvImportPreview.leads.length} leads`}
                    </button>
                  )}
                </div>
              )}

              {csvImportResult && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  Imported <strong>{csvImportResult.inserted}</strong> new leads.
                  {csvImportResult.skipped > 0 && ` Skipped ${csvImportResult.skipped} duplicates.`}
                </div>
              )}
            </div>

            {/* ── Section B: Leads Table ───────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Leads ({filteredLeads.length}{leadsShowContacted ? '' : ' not contacted'})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {outreachLeads.filter(l => l.sentCount > 0).length} contacted · {outreachLeads.filter(l => l.source === 'csv' || l.city).length} total imported
                  </p>
                </div>
                <button
                  onClick={async () => { setOutreachLeadsLoading(true); try { const l = await getCoachOutreachLeads(); setOutreachLeads(Array.isArray(l) ? l : []); } finally { setOutreachLeadsLoading(false); } }}
                  className="text-xs text-primary hover:underline"
                >{outreachLeadsLoading ? 'Loading…' : '↻ Refresh'}</button>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  placeholder="Search name / email / city…"
                  value={leadsSearch}
                  onChange={e => setLeadsSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-52"
                />
                <select
                  value={leadsTypeFilter}
                  onChange={e => setLeadsTypeFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All types</option>
                  {CLUB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={leadsShowContacted}
                    onChange={e => setLeadsShowContacted(e.target.checked)}
                    className="rounded border-gray-300 text-primary"
                  />
                  Show already contacted
                </label>
              </div>

              {/* Table */}
              <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 480 }}>
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Location</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {outreachLeadsLoading ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Loading…</td></tr>
                    ) : filteredLeads.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No leads match your filters.</td></tr>
                    ) : filteredLeads.map(lead => {
                      const contacted = lead.sentCount > 0;
                      const isPreviewing = leadsPreviewingId === lead._id;
                      const isSending = leadsSendingId === lead._id;
                      return (
                        <tr key={lead._id} className={`hover:bg-gray-50 transition-colors ${contacted ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900 max-w-[160px] truncate" title={lead.name}>{lead.name || '—'}</div>
                            {lead.priority > 0 && (
                              <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                                lead.priority >= 95 ? 'bg-green-100 text-green-700' :
                                lead.priority >= 80 ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>P{lead.priority}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <a href={`mailto:${lead.email}`} className="text-primary hover:underline text-xs">{lead.email}</a>
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <span className="text-xs text-gray-600 capitalize">{lead.type || '—'}</span>
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <span className="text-xs text-gray-500">{[lead.city, lead.country].filter(Boolean).join(', ') || '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {contacted ? (
                              <span className="inline-flex flex-col items-center gap-0.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-green-400" title={`Sent ${lead.sentCount}×`} />
                                <span className="text-[10px] text-gray-400">{lead.sentCount}×</span>
                              </span>
                            ) : (
                              <span className="inline-block w-2 h-2 rounded-full bg-gray-200" title="Not contacted" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleLeadPreview(lead)}
                                disabled={isPreviewing || isSending}
                                title="Send preview to yourself"
                                className="px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                              >
                                {isPreviewing ? '…' : '👁 Preview'}
                              </button>
                              <button
                                onClick={() => handleLeadSend(lead)}
                                disabled={isSending || isPreviewing}
                                title={contacted ? 'Send follow-up' : 'Send email'}
                                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap ${
                                  contacted
                                    ? 'border border-gray-300 text-gray-500 hover:bg-gray-50'
                                    : 'bg-primary text-white hover:bg-primary-dark'
                                }`}
                              >
                                {isSending ? '…' : contacted ? '↩ Follow-up' : '✉ Send'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Section C: Bulk Campaign ─────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-5">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Bulk Outreach Campaign</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Send templated emails to imported leads in scheduled batches.
                </p>
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <strong>Zoho limit:</strong> ~200 emails/day. Recommended: 10 emails every 2 hours = 120/day.
                  Default settings are already configured for safe sending.
                </div>
              </div>

              {/* Filters */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Filters</h4>

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Club / organization types (leave empty for all)</p>
                  <div className="flex flex-wrap gap-2">
                    {CLUB_TYPES.map(t => (
                      <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkFilterTypes.includes(t)}
                          onChange={e => {
                            if (e.target.checked) setBulkFilterTypes(prev => [...prev, t]);
                            else setBulkFilterTypes(prev => prev.filter(x => x !== t));
                          }}
                          className="rounded border-gray-300 text-primary"
                        />
                        <span className="capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Countries (comma-separated, empty = all)</label>
                    <input
                      type="text"
                      placeholder="CZ, UK, DE…"
                      value={bulkFilterCountries.join(', ')}
                      onChange={e => setBulkFilterCountries(
                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      )}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-48"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer self-end">
                    <input
                      type="checkbox"
                      checked={bulkNotContacted}
                      onChange={e => setBulkNotContacted(e.target.checked)}
                      className="rounded border-gray-300 text-primary"
                    />
                    Only not-contacted
                  </label>

                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer self-end">
                    <input
                      type="checkbox"
                      checked={bulkOnlyWithEmail}
                      onChange={e => setBulkOnlyWithEmail(e.target.checked)}
                      className="rounded border-gray-300 text-primary"
                    />
                    Only with email
                  </label>
                </div>
              </div>

              {/* Batch settings */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Batch Settings</h4>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Emails per batch (max 50)</label>
                    <input
                      type="number"
                      min={1} max={50}
                      value={bulkBatchSize}
                      onChange={e => setBulkBatchSize(Math.min(50, Math.max(1, Number(e.target.value) || 10)))}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-28"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Interval between batches</label>
                    <select
                      value={bulkInterval}
                      onChange={e => setBulkInterval(Number(e.target.value))}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours (recommended)</option>
                      <option value={240}>4 hours</option>
                      <option value={480}>8 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  At current settings: ~{Math.round(bulkBatchSize * (1440 / bulkInterval))} emails/day
                </p>
              </div>

              {/* Email template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Email Template</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const data = await getDefaultOutreachTemplate();
                          if (!data?.html) { addNotification('Default template not available on server', 'warning'); return; }
                          setBulkTemplate(data.html);
                          addNotification(`Loaded LaChart default template (${data.sizeKB} KB)`, 'success');
                        } catch (e) {
                          addNotification('Failed to load default template', 'error');
                        }
                      }}
                      className="text-xs px-3 py-1 rounded-md border border-primary/30 text-primary hover:bg-primary/5 font-medium"
                    >
                      Load LaChart default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const html = bulkTemplate || '';
                        if (!html.trim()) { addNotification('Nothing to preview — load or write a template first', 'info'); return; }
                        // Render preview in a new tab. Replace {{name}} with a sample
                        // value so the admin sees what the recipient sees.
                        const w = window.open('', '_blank');
                        if (!w) return;
                        w.document.open();
                        w.document.write(html.replace(/\{\{name\}\}/g, 'Sample Coach'));
                        w.document.close();
                      }}
                      className="text-xs px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                    >
                      Preview in new tab
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Subject line…"
                  value={bulkSubject}
                  onChange={e => setBulkSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <textarea
                  placeholder="Email body (HTML or plain text). Use {{name}} for contact name. Leave empty to use the default LaChart template."
                  value={bulkTemplate}
                  onChange={e => setBulkTemplate(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono resize-y"
                />
                <p className="text-xs text-gray-400">
                  Leave body empty to send the branded LaChart default. Full HTML
                  documents (starting with <code>&lt;!DOCTYPE&gt;</code> or
                  <code>&lt;html&gt;</code>) are sent verbatim — plain-text /
                  partial bodies get wrapped in the standard LaChart envelope.
                </p>
              </div>

              {bulkCampaignError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {bulkCampaignError}
                </div>
              )}

              <button
                onClick={handleStartBulkCampaign}
                disabled={bulkStarting}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  bulkStarting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'
                }`}
              >
                {bulkStarting ? 'Starting…' : 'Start Campaign'}
              </button>

              {/* Active campaigns */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Active Campaigns</h4>
                  <button
                    onClick={handleRefreshCampaigns}
                    disabled={bulkCampaignsLoading}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {bulkCampaignsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {bulkCampaigns.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">No campaigns yet. Start one above.</p>
                ) : (
                  <div className="space-y-3">
                    {bulkCampaigns.map(c => {
                      const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                      const statusColor = {
                        running: 'text-blue-600', scheduled: 'text-indigo-600',
                        completed: 'text-green-600', stopped: 'text-gray-500',
                        error: 'text-red-600', starting: 'text-yellow-600',
                      }[c.status] || 'text-gray-600';
                      return (
                        <div key={c.campaignId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className={`text-xs font-semibold uppercase ${statusColor}`}>{c.status}</span>
                              <span className="text-xs text-gray-400 ml-2">{new Date(c.startedAt).toLocaleString()}</span>
                            </div>
                            {(c.status === 'running' || c.status === 'scheduled' || c.status === 'starting') && (
                              <button
                                onClick={() => handleStopBulkCampaign(c.campaignId)}
                                className="px-3 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                            <span>Sent: <strong>{c.sent}</strong></span>
                            <span>Failed: <strong className="text-red-600">{c.failed}</strong></span>
                            <span>Remaining: <strong>{c.remaining}</strong></span>
                            <span>Total: <strong>{c.total}</strong></span>
                            <span>{c.batchSize} per batch / every {c.intervalMinutes} min</span>
                          </div>
                          {c.nextBatchAt && c.status === 'scheduled' && (
                            <p className="text-xs text-gray-400">Next batch: {new Date(c.nextBatchAt).toLocaleString()}</p>
                          )}
                          {c.errorMessage && (
                            <p className="text-xs text-red-600">{c.errorMessage}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Compose Email Modal */}
        <AnimatePresence>
          {composeContact && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/50"
                onClick={closeCompose}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col pointer-events-auto"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">Compose Email</h3>
                      <p className="text-sm text-gray-500 mt-0.5">To: <span className="font-medium text-primary">{composeContact.name}</span> · {composeContact.email}</p>
                    </div>
                    <button onClick={closeCompose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
                      <input
                        type="text"
                        value={composeSubject}
                        onChange={e => setComposeSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Body <span className="font-normal text-gray-400">(personalize the "[I saw your work...]" line)</span></label>
                      <textarea
                        value={composeBody}
                        onChange={e => setComposeBody(e.target.value)}
                        rows={16}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>
                    {composeContact.note && (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
                        <span className="font-semibold">Context:</span> {composeContact.note}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    {/* Lead history row */}
                    {composeContact.lead?.sentCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <span>📬</span>
                        <span>
                          Already sent <strong>×{composeContact.lead.sentCount}</strong>
                          {composeContact.lead.lastSentAt && (
                            <> · last on <strong>{new Date(composeContact.lead.lastSentAt).toLocaleDateString()}</strong></>
                          )}
                          {composeContact.lead.responded && <> · <span className="text-green-700 font-semibold">Responded ✓</span></>}
                          {composeContact.lead.registered && <> · <span className="text-purple-700 font-semibold">Registered 🎉</span></>}
                        </span>
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center justify-between gap-3">
                      <a href={composeContact.website} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-primary transition-colors truncate max-w-[180px]">
                        {composeContact.website} ↗
                      </a>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={closeCompose}
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePreviewSend}
                          disabled={composePreviewSending || !composeSubject.trim() || !composeBody.trim()}
                          title={`Send preview to ${currentUser?.email}`}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                            composePreviewSending || !composeSubject.trim() || !composeBody.trim()
                              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                          }`}
                        >
                          {composePreviewSending ? '⏳ Sending…' : '👁 Preview to me'}
                        </button>
                        <button
                          onClick={handleComposeSend}
                          disabled={composeSending || !composeSubject.trim() || !composeBody.trim()}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            composeSending || !composeSubject.trim() || !composeBody.trim()
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-primary text-white hover:bg-primary-dark shadow-sm'
                          }`}
                        >
                          {composeSending ? 'Sending…' : (composeContact.lead?.sentCount > 0 ? '↩ Send Follow-up' : '✉ Send Email')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {activeTab === 'analytics' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* Chart Controls */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Chart Controls</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Time Range:</label>
                    <select
                      value={chartTimeRange}
                      onChange={(e) => setChartTimeRange(Number(e.target.value))}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={14}>Last 14 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={60}>Last 60 days</option>
                      <option value={90}>Last 90 days</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Group By:</label>
                    <select
                      value={chartGroupBy}
                      onChange={(e) => setChartGroupBy(e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Login and Test Creation Chart */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">User Logins & Test Creation</h3>
              {loginChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={loginChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="dateLabel" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="logins" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      name="Logins"
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="tests" 
                      stroke="#82ca9d" 
                      strokeWidth={2}
                      name="Tests Created"
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="registrations" 
                      stroke="#ffc658" 
                      strokeWidth={2}
                      name="Registered Users"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No data available for the selected time range</div>
              )}
            </div>

            {/* Login Bar Chart */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Logins Over Time</h3>
              {loginChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={loginChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="dateLabel" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="logins" fill="#8884d8" name="Logins" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No data available for the selected time range</div>
              )}
            </div>

            {/* Test Creation Bar Chart */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Tests Created Over Time</h3>
              {loginChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={loginChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="dateLabel" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="tests" fill="#82ca9d" name="Tests Created" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No data available for the selected time range</div>
              )}
            </div>

            {/* Registered Users Bar Chart */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Registered Users Over Time</h3>
              {loginChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={loginChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="dateLabel" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="registrations" fill="#ffc658" name="Registered Users" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No data available for the selected time range</div>
              )}
            </div>

            {/* Event Analytics */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Event Analytics</h3>
              {eventStats?.byType && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {eventStats.byType.map((event) => (
                    <div key={event._id} className="border rounded-lg p-3 sm:p-4">
                      <h4 className="text-sm sm:text-base font-medium text-gray-900 truncate">{event._id}</h4>
                      <p className="text-xl sm:text-2xl font-bold text-primary mt-1">{event.count}</p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Last: {new Date(event.lastOccurrence).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'retention' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* Header card */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                🔁 Retention Email Preview
              </h3>
              <p className="text-sm text-gray-500">
                Send a test retention email to any user so you can preview exactly how it looks in their inbox.
              </p>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
              {/* Email type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email type</label>
                <select
                  value={retentionEmailType}
                  onChange={(e) => setRetentionEmailType(e.target.value)}
                  className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {RETENTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* User search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search user</label>
                <input
                  type="text"
                  placeholder="Name or email…"
                  value={retentionSearch}
                  onChange={(e) => { setRetentionSearch(e.target.value); setRetentionResult(null); }}
                  className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Result feedback */}
              {retentionResult && (
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  retentionResult.ok
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <span>{retentionResult.ok ? '✅' : '❌'}</span>
                  {retentionResult.msg}
                </div>
              )}
            </div>

            {/* User list */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 sm:px-6 py-3 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  Users ({retentionFilteredUsers.length}{retentionFilteredUsers.length === 40 ? '+' : ''})
                </h4>
                <span className="text-xs text-gray-400">Showing active users with email</span>
              </div>

              {retentionFilteredUsers.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No users match your search.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Last login</th>
                        <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {retentionFilteredUsers.map((u) => (
                        <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 sm:px-6 py-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                {(u.name?.[0] || u.email?.[0] || '?').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {u.name} {u.surname}
                                </p>
                                <p className="text-xs text-gray-500 truncate sm:hidden">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                            <span className="text-sm text-gray-600">{u.email}</span>
                          </td>
                          <td className="px-4 sm:px-6 py-3 hidden md:table-cell">
                            <span className="text-sm text-gray-500">
                              {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-3 text-right">
                            <button
                              onClick={() => handleSendRetentionPreview(u._id)}
                              disabled={retentionSending === u._id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs sm:text-sm font-medium rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {retentionSending === u._id ? (
                                <>
                                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                  </svg>
                                  Sending…
                                </>
                              ) : (
                                <>📨 Send preview</>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Edit User</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleUserUpdate(editingUser._id, {
                name: formData.get('name'),
                surname: formData.get('surname'),
                email: formData.get('email'),
                role: formData.get('role'),
                admin: formData.get('admin') === 'on',
                isActive: formData.get('isActive') === 'on',
                premium: formData.get('premium') === 'on'
              });
            }}>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingUser.name}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Surname</label>
                  <input
                    type="text"
                    name="surname"
                    defaultValue={editingUser.surname}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingUser.email}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">Role</label>
                  <select
                    name="role"
                    defaultValue={editingUser.role}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base"
                  >
                    <option value="athlete">Athlete</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                    <option value="tester">Tester</option>
                    <option value="testing">Testing</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="admin"
                    defaultChecked={editingUser.admin}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-xs sm:text-sm text-gray-900">Admin privileges</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={editingUser.isActive}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-xs sm:text-sm text-gray-900">Active</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="premium"
                    defaultChecked={!!editingUser.premium}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-xs sm:text-sm text-gray-900">
                    Premium access (manual)
                  </label>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500">
                  Grants paid features without Stripe. Effective access also includes active Pro+ subscriptions.
                </p>
              </div>
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm sm:text-base"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Paced mass-email campaign card (Zoho-safe batching) ───────────────────
function PacedEmailCampaignCard({
  title,
  description,
  borderAccentClass = 'border-primary',
  badgeLabel = 'Active campaign',
  fetchStatusApi,
  sendPreviewApi,
  runCampaignApi,
  resetCampaignApi,
}) {
  const [status, setStatus] = useState(null);          // { pending, sent, totalEligible }
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewEmail, setPreviewEmail] = useState('');
  const [running, setRunning] = useState(false);
  const [runStats, setRunStats] = useState(null);
  const [error, setError] = useState(null);
  // Conservative Zoho-free defaults. Admin can tighten if they're on a paid plan.
  const [batchSize, setBatchSize] = useState(1);
  const [intervalMin, setIntervalMin] = useState(5);       // minutes between batches
  const [maxThisRun, setMaxThisRun] = useState(20);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await fetchStatusApi();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoadingStatus(false);
    }
  }, [fetchStatusApi]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      const r = await sendPreviewApi(previewEmail ? { email: previewEmail.trim() } : {});
      // Build a detailed diagnostic so it's obvious whether the relay
      // actually accepted the recipient. nodemailer can return 250 OK
      // from the local connector even when the upstream (Zoho, Gmail)
      // silently drops the address — the `smtp.accepted` / `rejected`
      // arrays are the truth.
      const lines = [];
      if (r.sent) {
        lines.push(`✓ Sent to ${r.to || previewEmail || 'your inbox'} (${r.lang === 'cz' ? 'Czech' : 'English'}).`);
      } else {
        lines.push(`✗ Preview NOT sent.`);
        if (r.reason) lines.push(`Reason: ${r.reason}`);
      }
      if (r.smtp) {
        const { accepted, rejected, response, messageId, code, command } = r.smtp;
        if (accepted?.length) lines.push(`Accepted: ${accepted.join(', ')}`);
        if (rejected?.length) lines.push(`Rejected: ${rejected.join(', ')}`);
        if (response) lines.push(`SMTP: ${response}`);
        if (messageId) lines.push(`Message-Id: ${messageId}`);
        if (code) lines.push(`Code: ${code}${command ? ' / ' + command : ''}`);
      }
      lines.push('');
      lines.push('If sent OK but no email arrived: check spam, then the sending-mailbox provider dashboard (Zoho/Gmail Sent Items + outbound logs).');
      alert(lines.join('\n'));
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleRun = async ({ dryRun = false } = {}) => {
    const eta = Math.round((maxThisRun * intervalMin / batchSize));
    if (!dryRun) {
      const ok = window.confirm(
        `Send the email to up to ${maxThisRun} users now?\n\n` +
        `Pace: ${batchSize} email${batchSize === 1 ? '' : 's'} every ${intervalMin} min.\n` +
        `Estimated duration: ~${eta} min.\n\n` +
        `The request will block the browser until the run finishes — keep this tab open. ` +
        `You can come back and run again to send the next batch.`
      );
      if (!ok) return;
    }
    setRunning(true);
    setRunStats(null);
    setError(null);
    try {
      const r = await runCampaignApi({
        batchSize,
        batchIntervalMs: intervalMin * 60 * 1000,
        maxEmailsPerRun: maxThisRun,
        dryRun,
      });
      setRunStats(r?.stats || null);
      await loadStatus();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Clear the "sent" marker for EVERYONE so they can receive the email again on the next run?\n\nUse only if you re-sent the wrong content.')) return;
    try {
      const r = await resetCampaignApi();
      alert(`Reset: ${r.modified} of ${r.matched} users cleared.`);
      await loadStatus();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const pendingPct = status && status.totalEligible
    ? Math.round((status.sent / status.totalEligible) * 100)
    : 0;

  return (
    <div className={`bg-white rounded-lg shadow p-4 sm:p-6 border-l-4 ${borderAccentClass}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">{badgeLabel}</span>
          </div>
          <h3 className="mt-1 text-base sm:text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            {description}
          </p>
        </div>
        <button
          onClick={loadStatus}
          disabled={loadingStatus}
          className="self-start sm:self-auto px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
        >
          {loadingStatus ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      {/* Status pills */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
          <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wide">Eligible</div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{status?.totalEligible ?? '—'}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="text-[10px] sm:text-xs text-emerald-700 uppercase tracking-wide">Sent</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1">{status?.sent ?? '—'}</div>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <div className="text-[10px] sm:text-xs text-amber-700 uppercase tracking-wide">Pending</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-700 mt-1">{status?.pending ?? '—'}</div>
        </div>
      </div>

      {status && status.totalEligible > 0 && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pendingPct}%` }} />
        </div>
      )}

      {/* Preview row */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">1. Preview to yourself</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            placeholder="your@email.com (leave blank to send to your admin account)"
            value={previewEmail}
            onChange={(e) => setPreviewEmail(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-dark disabled:opacity-50"
          >
            {previewing ? 'Sending…' : 'Send preview'}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Sends one email immediately. Doesn't count toward the campaign queue — use it freely to iterate.
        </p>
      </div>

      {/* Run controls */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">2. Send to users (paced)</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] text-gray-600">Emails per batch</span>
            <input
              type="number" min="1" max="50" value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-600">Interval (min)</span>
            <input
              type="number" min="1" max="120" value={intervalMin}
              onChange={(e) => setIntervalMin(Math.max(1, Math.min(120, Number(e.target.value) || 5)))}
              className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-600">Max this run</span>
            <input
              type="number" min="1" max="1000" value={maxThisRun}
              onChange={(e) => setMaxThisRun(Math.max(1, Math.min(1000, Number(e.target.value) || 20)))}
              className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </label>
        </div>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
          Zoho Mail FREE tolerates ~25 outbound to new addresses per day. Defaults (1 email / 5 min, cap 20)
          stay well under that. On a paid plan you can crank up to 5 per 1 min.
          Estimated this run: ~{Math.round(maxThisRun * intervalMin / batchSize)} min.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => handleRun({ dryRun: false })}
            disabled={running || !status || status.pending === 0}
            className="flex-1 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {running ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
                Running… keep tab open
              </>
            ) : (
              <>
                Send to {Math.min(maxThisRun, status?.pending ?? maxThisRun)} pending users
              </>
            )}
          </button>
          <button
            onClick={() => handleRun({ dryRun: true })}
            disabled={running || !status || status.pending === 0}
            className="px-4 py-2.5 bg-gray-100 text-gray-800 text-sm font-medium rounded-md hover:bg-gray-200 disabled:opacity-50"
            title="Pick the first batch and run through the prep without actually emailing — useful to confirm template selection."
          >
            Dry run
          </button>
        </div>
      </div>

      {runStats && (
        <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-3 text-xs leading-relaxed">
          <div className="font-semibold text-gray-800 mb-1">Last run</div>
          <div className="text-gray-700">
            attempted <b>{runStats.totalAttempted}</b> · sent <b className="text-emerald-700">{runStats.sent}</b> · skipped <b>{runStats.skipped}</b> · failed <b className="text-red-700">{runStats.failed}</b>
          </div>
          {Object.entries(runStats.byReason || {}).length > 0 && (
            <div className="mt-1 text-gray-500">
              {Object.entries(runStats.byReason).map(([r, n]) => <span key={r} className="mr-2">{r}: {n}</span>)}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          Idempotent — already-sent users are skipped automatically.
        </span>
        <button
          onClick={handleReset}
          className="text-[11px] text-gray-500 hover:text-red-600 underline"
        >
          Reset sent markers
        </button>
      </div>
    </div>
  );
}

function IosLaunchJun2026Card() {
  return (
    <PacedEmailCampaignCard
      title="iOS App Store launch — June 2026"
      description="App-download email with App Store CTA, home-screen widget and Apple Health highlights. Auto-detects CZ/EN per recipient. Honours email-notifications opt-out and is idempotent (no double sends). Use this instead of clicking Send app download per user."
      borderAccentClass="border-emerald-600"
      badgeLabel="App download"
      fetchStatusApi={fetchIosLaunchJun2026Status}
      sendPreviewApi={sendIosLaunchJun2026Preview}
      runCampaignApi={runIosLaunchJun2026Campaign}
      resetCampaignApi={resetIosLaunchJun2026}
    />
  );
}

function WhatsNewMay2026Card() {
  return (
    <PacedEmailCampaignCard
      title="What's new — May 2026"
      description="Re-engagement email (English only) highlighting the iPhone app on the App Store, workout planner, training calendar, and lactate-test upgrades. Honours email-notifications opt-out and is idempotent (no double sends)."
      fetchStatusApi={fetchWhatsNewMay2026Status}
      sendPreviewApi={sendWhatsNewMay2026Preview}
      runCampaignApi={runWhatsNewMay2026Campaign}
      resetCampaignApi={resetWhatsNewMay2026}
    />
  );
}

export default AdminDashboard;