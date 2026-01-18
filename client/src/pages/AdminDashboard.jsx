import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getEventStats } from '../utils/eventLogger';
import { getAdminUsers, getAdminStats, updateUserAdmin, sendReactivationEmail, sendThankYouEmail, sendThankYouEmailToAll } from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const AdminDashboard = () => {
  const { user, loading } = useAuth();
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [eventStats, setEventStats] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [emailLoadingUserId, setEmailLoadingUserId] = useState(null);
  const [thankYouEmailLoadingUserId, setThankYouEmailLoadingUserId] = useState(null);
  const [sendingToAll, setSendingToAll] = useState(false);
  const [usersLimit, setUsersLimit] = useState(20);
  const [chartTimeRange, setChartTimeRange] = useState(30); // days
  const [chartGroupBy, setChartGroupBy] = useState('day'); // 'day' or 'week'

  const fetchData = async () => {
    try {
      setLoadingData(true);
      const endDate = new Date();
      const startDate = new Date(Date.now() - chartTimeRange * 24 * 60 * 60 * 1000);
      const [usersData, statsData, eventStatsData] = await Promise.all([
        getAdminUsers(),
        getAdminStats(),
        getEventStats(null, startDate.toISOString(), endDate.toISOString())
      ]);
      
      // Data loaded successfully; debug logging removed to keep console clean
      setUsers(usersData);
      setStats(statsData);
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

  const handleSendReactivationEmail = async (targetUser) => {
    try {
      setEmailLoadingUserId(targetUser._id);
      await sendReactivationEmail(targetUser._id);
      addNotification(`Reactivation email sent to ${targetUser.email}`, 'success');
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to send reactivation email';
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
      const message = err?.response?.data?.error || 'Failed to send thank you email';
      addNotification(message, 'error');
      console.error('Thank you email error:', err);
    } finally {
      setThankYouEmailLoadingUserId(null);
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
      const message = err?.response?.data?.error || 'Failed to send thank you emails to all users';
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

  // Prepare login chart data
  const loginChartData = useMemo(() => {
    if (!eventStats?.daily) return [];
    
    const loginEvents = eventStats.daily.filter(e => e._id.type === 'login');
    const testEvents = eventStats.daily.filter(e => e._id.type === 'test_created');
    
    // Group by date
    const dateMap = new Map();
    
    loginEvents.forEach(e => {
      const date = e._id.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, logins: 0, tests: 0 });
      }
      dateMap.get(date).logins = e.count;
    });
    
    testEvents.forEach(e => {
      const date = e._id.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, logins: 0, tests: 0 });
      }
      dateMap.get(date).tests = e.count;
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
          weekMap.set(weekKey, { date: weekKey, logins: 0, tests: 0 });
        }
        weekMap.get(weekKey).logins += item.logins;
        weekMap.get(weekKey).tests += item.tests;
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
    
    // Sort by last login (most recent first)
    filtered = filtered.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return 0;
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return new Date(b.lastLogin) - new Date(a.lastLogin);
    });
    
    // Apply limit
    return filtered.slice(0, usersLimit);
  }, [users, searchQuery, usersLimit]);

  if (loading) return null;
  if (!user?.admin) {
    return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
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

  const tabs = [
    { id: 'overview', name: 'Overview', icon: '📊' },
    { id: 'users', name: 'Users', icon: '👥' },
    { id: 'analytics', name: 'Analytics', icon: '📈' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
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
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
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

                      <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                        <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${
                          user.stravaConnected ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          Strava: {user.stravaConnected ? 'Connected' : '—'}
                        </span>
                        {user.lastLogin && (
                          <span className="text-gray-400">
                            Last login: {new Date(user.lastLogin).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {user.role === 'coach' && (
                        <div className="text-xs text-gray-400 mt-1.5 text-center">
                          Tests include athletes + own
                        </div>
                      )}
                      <div className="mt-2 flex flex-col gap-2">
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
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strava</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan="10" className="px-4 lg:px-6 py-8 text-center text-gray-500">
                            {searchQuery ? `No users found matching "${searchQuery}"` : 'No users found'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                        <tr key={user._id} className="hover:bg-gray-50">
                          <td className="px-4 lg:px-6 py-4">
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
                          <td className="px-4 lg:px-6 py-4">
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
                            {user.sport || 'Not specified'}
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
                            <div className="flex items-center">
                              <span className="text-base lg:text-lg font-semibold text-blue-600">{user.trainingCount || 0}</span>
                              <span className="ml-1 text-xs text-gray-500">trainings</span>
                            </div>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
                            <div className="flex items-center">
                              <span className="text-base lg:text-lg font-semibold text-purple-600">
                                {user.testCount !== undefined && user.testCount !== null ? user.testCount : 0}
                              </span>
                              <span className="ml-1 text-xs text-gray-500">tests</span>
                              {user.role === 'coach' && (
                                <span className="ml-2 text-xs text-gray-400 hidden xl:inline">(athletes + own)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
                            <span className="text-base lg:text-lg font-semibold text-gray-900">
                              {user.loginCount !== undefined && user.loginCount !== null ? user.loginCount : 0}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
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
                          <td className="px-4 lg:px-6 py-4 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.stravaConnected ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {user.stravaConnected ? 'Connected' : '—'}
                            </span>
                            {user.stravaConnected && user.strava?.lastSyncDate && (
                              <div className="text-xs text-gray-400 mt-1">
                                Sync: {new Date(user.strava.lastSyncDate).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm">
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
                          <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
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
                isActive: formData.get('isActive') === 'on'
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

export default AdminDashboard;