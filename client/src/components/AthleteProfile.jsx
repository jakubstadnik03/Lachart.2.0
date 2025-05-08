import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import SpiderChart from './DashboardPage/SpiderChart';
import TrainingGraph from './DashboardPage/TrainingGraph';
import UserTrainingsTable from './Training-log/UserTrainingsTable';
import PreviousTestingComponent from './Testing-page/PreviousTestingComponent';
import SportsSelector from './Header/SportsSelector';
import api from '../services/api';
import { motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useNotification } from '../context/NotificationContext';

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTestingSport, setSelectedTestingSport] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    address: '',
    weight: '',
    height: '',
    sport: '',
    specialization: '',
    notes: '',
  });
  const { addNotification } = useNotification();

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Načtení všech dat paralelně
        const [athleteData, trainingsData, testsData] = await Promise.all([
          api.get(`/user/athlete/${athleteId}`),
          api.get(`/user/athlete/${athleteId}/trainings`),
          api.get(`/test/list/${athleteId}`)
        ]);

        setAthlete(athleteData.data);
        setTrainings(trainingsData.data || []);
        setTests(testsData.data || []);
      } catch (error) {
        console.error('Error fetching athlete data:', error);
        setError(error.message || 'Failed to load athlete data');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'coach' && athleteId) {
      fetchAthleteData();
    }
  }, [athleteId, user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'dateOfBirth') {
      if (value) {
        const [year, month, day] = value.split('-');
        const formattedDate = `${day}.${month}.${year}`;
        setFormData(prev => ({
          ...prev,
          [name]: formattedDate
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleEditAthlete = () => {
    setFormData({
      name: athlete.name,
      surname: athlete.surname,
      dateOfBirth: formatDate(athlete.dateOfBirth),
      email: athlete.email,
      phone: athlete.phone || '',
      address: athlete.address || '',
      weight: athlete.weight || '',
      height: athlete.height || '',
      sport: athlete.sport || '',
      specialization: athlete.specialization || '',
      notes: athlete.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const formattedDate = formData.dateOfBirth ? 
        formData.dateOfBirth.split('.').reverse().join('-') : 
        null;

      const response = await api.put(`/user/coach/edit-athlete/${athleteId}`, {
        ...formData,
        dateOfBirth: formattedDate
      });

      setAthlete(response.data.athlete);
      addNotification('Athlete updated successfully', 'success');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error updating athlete:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to update athlete';
      addNotification(errorMessage, 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      surname: '',
      dateOfBirth: '',
      email: '',
      phone: '',
      address: '',
      weight: '',
      height: '',
      sport: '',
      specialization: '',
      notes: '',
    });
  };

  // Formátování data
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not set';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getAvatarBySport = (sport) => {
    const sportLower = sport?.toLowerCase() || '';
    switch (sportLower) {
      case 'triathlon':
        return '/images/triathlete-avatar.jpg';
      case 'running':
        return '/images/runner-avatar.jpg';
      case 'cycling':
        return '/images/cyclist-avatar.webp';
      case 'swimming':
        return '/images/swimmer-avatar.jpg';
      default:
        return '/images/triathlete-avatar.jpg';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex justify-center items-center h-screen">
        No athlete data available
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-100 px-2 sm:px-4 md:px-6"
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="max-w-7xl mx-auto py-4 sm:py-6"
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="px-2 sm:px-4 py-4 sm:py-6"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="bg-white rounded-lg shadow"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="px-2 sm:px-4 py-4 sm:p-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
                <motion.h1
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className="text-xl sm:text-2xl font-bold text-gray-900"
                >
                  Athlete Profile
                </motion.h1>
                {user?.role === 'coach' && (
                  <button
                    onClick={handleEditAthlete}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
              >
                {/* Profile Card */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1.4 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden"
                >
                  <div className="h-24 sm:h-32 bg-gradient-to-r from-purple-100 to-purple-50 relative">
                    <div className="absolute top-2 sm:top-4 right-2 sm:right-4">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </motion.button>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className="flex justify-center -mt-12 sm:-mt-16">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gray-200 border-4 border-white overflow-hidden relative z-10">
                        <img
                          src={getAvatarBySport(athlete.sport)}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="text-center mt-3 sm:mt-4">
                      <h3 className="text-lg sm:text-2xl font-bold text-gray-900">
                        {athlete.name} {athlete.surname}
                      </h3>
                      <p className="text-sm sm:text-base text-gray-500 mt-1">{athlete.specialization || 'Athlete'}</p>
                    </div>
                    <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="bg-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div className="text-base sm:text-xl font-semibold text-secondary">{athlete.sport || 'Not set'}</div>
                        <div className="text-xs sm:text-sm text-gray-500 mt-1">{athlete.specialization || 'Not set'}</div>
                      </div>
                      <div className="bg-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div className="text-base sm:text-xl font-semibold text-primary">{formatDate(athlete.dateOfBirth)}</div>
                        <div className="text-xs sm:text-sm text-gray-500 mt-1">{`${athlete.height || '0'} cm ${athlete.weight || '0'} kg`}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Contact Information */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1.6 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden"
                >
                  <div className="h-24 sm:h-32 bg-gradient-to-r from-blue-100 to-blue-50" />
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Contact Information</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        <span className="text-gray-700">{athlete.email || 'Not set'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        <span className="text-gray-700">{athlete.phone || 'Not set'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-700">{athlete.address || 'Not set'}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Bio Information */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1.8 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden"
                >
                  <div className="h-24 sm:h-32 bg-gradient-to-r from-green-100 to-green-50" />
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Bio</h3>
                    <p className="text-gray-700">{athlete.bio || 'No bio available'}</p>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Training and Testing Section */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 2.0 }}
        className="mt-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <SpiderChart 
              trainings={trainings}
              selectedSport={selectedSport}
              className="w-[400px]"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
          >
            <TrainingGraph 
              trainingList={trainings}
              selectedSport={selectedSport}
              selectedTitle={selectedTitle}
              setSelectedTitle={setSelectedTitle}
              selectedTraining={selectedTraining}
              setSelectedTraining={setSelectedTraining}
            />
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className='lg:col-span-2'
          >
            <UserTrainingsTable trainings={trainings} />
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="lg:col-span-2 mt-6"
        >
          <div className="mb-4">
            <SportsSelector onSportChange={setSelectedTestingSport} />
          </div>
          <PreviousTestingComponent 
            selectedSport={selectedTestingSport}
            tests={tests}
            setTests={setTests}
            athleteId={athlete._id}
          />
        </motion.div>
      </motion.div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-3xl p-4 w-full max-w-2xl overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Edit Athlete</h2>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-[200px_1fr] gap-4">
                {/* Left side - Profile Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Profile Image
                  </label>
                  <div className="w-full aspect-square bg-gray-200 rounded-full overflow-hidden flex items-center justify-center">
                    {formData.sport && getAvatarBySport(formData.sport) ? (
                      <img
                        src={getAvatarBySport(formData.sport)}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <p className="text-sm text-gray-500 text-center px-4">
                        Avatar will be selected after choosing sport
                      </p>
                    )}
                  </div>
                </div>

                {/* Right side - Basic Info */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name<span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Surname<span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="surname"
                      required
                      value={formData.surname}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter Surname"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date of Birth<span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="dateOfBirth"
                      required
                      value={formData.dateOfBirth ? formData.dateOfBirth.split('.').reverse().join('-') : ''}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom part of the form */}
              <div className="space-y-2 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email<span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter email address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone<span className="text-orange-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                    placeholder="Enter your address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weight
                    </label>
                    <input
                      type="text"
                      name="weight"
                      value={formData.weight}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter weight"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Height
                    </label>
                    <input
                      type="text"
                      name="height"
                      value={formData.height}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="Enter height"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sports
                    </label>
                    <select
                      name="sport"
                      value={formData.sport}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select sports</option>
                      <option value="triathlon">Triathlon</option>
                      <option value="running">Running</option>
                      <option value="swimming">Swimming</option>
                      <option value="cycling">Cycling</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Specialization
                  </label>
                  <input
                    type="text"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                    placeholder="Enter specialization (e.g., Sprint, Long Distance)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full p-2 border border-gray-300 rounded-lg"
                    placeholder="Write notes..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-dark"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
}