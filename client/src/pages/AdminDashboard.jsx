import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getEventStats } from '../utils/eventLogger';
import { getAdminUsers, getAdminStats, updateUserAdmin } from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';

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

  const fetchData = async () => {
    try {
      setLoadingData(true);
      const [usersData, statsData, eventStatsData] = await Promise.all([
        getAdminUsers(),
        getAdminStats(),
        getEventStats(null, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString())
      ]);
      
      // Debug: Log coach users data
      const coachUsers = usersData.filter(u => u.role === 'coach');
      console.log('[AdminDashboard] Coach users data:', coachUsers.map(u => ({
        name: `${u.name} ${u.surname}`,
        testCount: u.testCount,
        testCountType: typeof u.testCount,
        trainingCount: u.trainingCount,
        trainingCountType: typeof u.trainingCount,
        _id: u._id,
        role: u.role
      })));
      
      // Also log raw data for first coach to see structure
      if (coachUsers.length > 0) {
        console.log('[AdminDashboard] First coach raw data:', coachUsers[0]);
      }
      
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
  }, []);

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
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900">User Management</h3>
                <p className="text-xs sm:text-sm text-gray-600">Manage user accounts and permissions</p>
              </div>
              
              {/* Mobile Card View */}
              <div className="block md:hidden divide-y divide-gray-200">
                {users.map((user) => (
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
                    </div>
                  </div>
                ))}
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
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strava</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                        <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
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
                          <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm font-medium">
                            <button
                              onClick={() => setEditingUser(user)}
                              className="text-primary hover:text-primary-dark"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
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