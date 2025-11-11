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
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage your application and users</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleString()}
              </div>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
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
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <span className="text-2xl">👥</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <span className="text-2xl">🏃</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Athletes</p>
                    <p className="text-2xl font-bold text-gray-900">{stats?.usersByRole?.athlete || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <span className="text-2xl">👨‍🏫</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Coaches</p>
                    <p className="text-2xl font-bold text-gray-900">{stats?.usersByRole?.coach || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <span className="text-2xl">📈</span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">New This Month</p>
                    <p className="text-2xl font-bold text-gray-900">{stats?.recentRegistrations || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sports Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Users by Sport</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats?.usersBySport || {}).map(([sport, count]) => (
                  <div key={sport} className="text-center">
                    <p className="text-2xl font-bold text-primary">{count}</p>
                    <p className="text-sm text-gray-600">{sport}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
              <p className="text-sm text-gray-600">Manage user accounts and permissions</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sport</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trainings</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tests</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-white font-medium">
                                {user.name?.[0]}{user.surname?.[0]}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name} {user.surname}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                            {user.role === 'coach' && user._id && (
                              <div className="text-xs text-gray-400 mt-0.5">ID: {user._id}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'admin' ? 'bg-red-100 text-red-800' :
                          user.role === 'coach' ? 'bg-purple-100 text-purple-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role}
                          {user.admin && ' (Admin)'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.sport || 'Not specified'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span className="text-lg font-semibold text-blue-600">{user.trainingCount || 0}</span>
                          <span className="ml-1 text-xs text-gray-500">trainings</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span className="text-lg font-semibold text-purple-600">
                            {(() => {
                              const count = user.testCount !== undefined && user.testCount !== null ? user.testCount : 0;
                              // Debug log for coaches
                              if (user.role === 'coach' && count === 0) {
                                console.log(`[AdminDashboard] Coach ${user.name} ${user.surname} has testCount:`, user.testCount, 'type:', typeof user.testCount);
                              }
                              return count;
                            })()}
                          </span>
                          <span className="ml-1 text-xs text-gray-500">tests</span>
                          {user.role === 'coach' && (
                            <span className="ml-2 text-xs text-gray-400">(athletes + own)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-primary hover:text-primary-dark mr-3"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'analytics' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Analytics</h3>
              {eventStats?.byType && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {eventStats.byType.map((event) => (
                    <div key={event._id} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{event._id}</h4>
                      <p className="text-2xl font-bold text-primary">{event.count}</p>
                      <p className="text-sm text-gray-500">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit User</h3>
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
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingUser.name}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Surname</label>
                  <input
                    type="text"
                    name="surname"
                    defaultValue={editingUser.surname}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingUser.email}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    name="role"
                    defaultValue={editingUser.role}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="athlete">Athlete</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="admin"
                    defaultChecked={editingUser.admin}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Admin privileges</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={editingUser.isActive}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Active</label>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
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