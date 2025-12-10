import React, { useEffect, useState, useCallback } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import SportsSelector from "../components/Header/SportsSelector";
import EditProfileModal from "../components/Profile/EditProfileModal";
import ChangePasswordModal from "../components/Profile/ChangePasswordModal";
import { updateUserProfile } from '../services/api';
import { 
  PencilIcon, 
  KeyIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  CalendarIcon,
  MapPinIcon,
  ScaleIcon,
  ArrowTrendingUpIcon,
  TrophyIcon,
  AcademicCapIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const ProfilePage = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedSport] = useState('bike');
  const [selectedTestingSport, setSelectedTestingSport] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedZoneSport, setSelectedZoneSport] = useState('cycling'); // cycling or running

  // const getUserProfile = async () => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.PROFILE, {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching user profile:', error);
  //     throw error;
  //   }
  // };

  // const getTrainingsByAthleteId = async (athleteId) => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.TRAININGS(athleteId), {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching trainings:', error);
  //     throw error;
  //   }
  // };

  // const getAthleteTests = async (athleteId) => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.ATHLETE_TESTS(athleteId), {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching tests:', error);
  //     throw error;
  //   }
  // };

  // Formátování data
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      // Pokud je to ISO string, parsujeme ho
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not set';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
    } catch (error) {
      return 'Not set';
    }
  };

  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const loadProfileData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const profileResponse = await api.get(`/user/profile`);
      const profileData = profileResponse.data;
      console.log('Profile data:', profileData);

      // Určení avataru podle role
      const defaultAvatar = profileData.role === 'coach' 
        ? '/images/coach-avatar.webp'  // Avatar pro trenéra
        : '/images/triathlete-avatar.jpg';  // Avatar pro atleta

      setUserInfo({
        name: `${profileData.name} ${profileData.surname}`,
        email: profileData.email,
        phone: profileData.phone || 'Not set',
        weight: profileData.weight || 'Not set',
        height: profileData.height || 'Not set',
        bio: profileData.bio || 'Not set',
        dateOfBirth: profileData.dateOfBirth ? formatDate(profileData.dateOfBirth) : 'Not set',
        dateOfBirthRaw: profileData.dateOfBirth, // Keep raw for display
        address: profileData.address || 'Not set',
        sport: profileData.sport || 'Not set',
        specialization: profileData.specialization || 'Not set',
        title: profileData.role === 'coach' ? 'Coach' : profileData.specialization || 'Not set',
        avatar: profileData.avatar || defaultAvatar,  // Použití defaultního avataru podle role
        _id: profileData._id,
        role: profileData.role,
        powerZones: profileData.powerZones // Include power zones
      });

      // Pokud je to trenér, nemusíme načítat tréninky a testy
      if (profileData.role !== 'coach') {
        const [trainingsResponse, testsResponse] = await Promise.all([
          api.get(`/user/athlete/${profileData._id}/trainings`),
          api.get(`/test/list/${profileData._id}`)
        ]);

        setTrainings(trainingsResponse.data || []);
        setTests(testsResponse.data || []);
      } else {
        setTrainings([]);
        setTests([]);
      }

    } catch (error) {
      console.error('Error loading profile data:', error);
      setError(error.message || 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Přidáme efekt pro změnu sportu
  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        setSelectedTitle(uniqueTitles[0]);
        const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
        if (firstTrainingWithTitle) {
          setSelectedTraining(firstTrainingWithTitle._id);
        }
      }
    }
  }, [selectedSport, trainings, selectedTitle]);

  const handleProfileUpdate = async (updatedData) => {
    try {
      const { name, ...restData } = updatedData;
      const [firstName, ...lastNameParts] = name.split(' ');
      const surname = lastNameParts.join(' ');

      const dataToSend = {
        ...restData,
        name: firstName,
        surname: surname,
        height: restData.height ? Number(restData.height) : undefined,
        weight: restData.weight ? Number(restData.weight) : undefined,
      };

      const response = await updateUserProfile(dataToSend);
      const updatedUser = response.data;

      setUserInfo({
        name: `${updatedUser.name} ${updatedUser.surname}`,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        weight: updatedUser.weight || '',
        height: updatedUser.height || '',
        bio: updatedUser.bio || '',
        dateOfBirth: updatedUser.dateOfBirth ? formatDate(updatedUser.dateOfBirth) : '',
        dateOfBirthRaw: updatedUser.dateOfBirth,
        address: updatedUser.address || '',
        sport: updatedUser.sport || '',
        specialization: updatedUser.specialization || '',
        title: updatedUser.specialization || '',
        avatar: updatedUser.avatar || '/images/triathlete-avatar.jpg',
        powerZones: updatedUser.powerZones || userInfo.powerZones // Keep power zones
      });

      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  if (loading) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-center h-screen"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </motion.div>
  );

  if (error) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  if (!userInfo) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 text-gray-600"
    >
      No user data available
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-2 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto"
    >
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl shadow-sm overflow-hidden relative"
      >
        <div className="absolute top-4 right-4 flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsEditModalOpen(true)}
            className="p-2 rounded-full bg-white shadow-sm hover:bg-gray-50"
          >
            <PencilIcon className="w-5 h-5 text-gray-600" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsPasswordModalOpen(true)}
            className="p-2 rounded-full bg-white shadow-sm hover:bg-gray-50"
          >
            <KeyIcon className="w-5 h-5 text-gray-600" />
          </motion.button>
        </div>

        <div className="h-24 md:h-32 bg-gradient-to-r from-purple-100 to-purple-50" />
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row sm:items-end -mt-12 mb-4 gap-4 sm:gap-0"
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white overflow-hidden bg-white mx-auto sm:mx-0">
              <img
                src={userInfo.avatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-center sm:text-left sm:ml-4 sm:mb-2">
              <h1 className="text-xl md:text-2xl font-bold">{userInfo.name}</h1>
              <p className="text-gray-600">{userInfo.title}</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-4 md:mt-6"
          >
            <h2 className="text-lg font-semibold mb-3 md:mb-4">Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              {/* Basic Info */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <UserIcon className="w-5 h-5" />
                  <p className="text-sm">Full Name</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.name || 'Not set'}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <EnvelopeIcon className="w-5 h-5" />
                  <p className="text-sm">Email</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.email || 'Not set'}</p>
              </motion.div>

              {/* Physical Stats */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <ScaleIcon className="w-5 h-5" />
                  <p className="text-sm">Weight</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.weight ? `${userInfo.weight} kg` : 'Not set'}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <ArrowTrendingUpIcon className="w-5 h-5" />
                  <p className="text-sm">Height</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.height ? `${userInfo.height} cm` : 'Not set'}</p>
              </motion.div>

              {/* Sport Info */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <TrophyIcon className="w-5 h-5" />
                  <p className="text-sm">Sport</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.sport || 'Not set'}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <AcademicCapIcon className="w-5 h-5" />
                  <p className="text-sm">Specialization</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.specialization || 'Not set'}</p>
              </motion.div>

              {/* Contact Info */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <PhoneIcon className="w-5 h-5" />
                  <p className="text-sm">Phone</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.phone || 'Not set'}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <CalendarIcon className="w-5 h-5" />
                  <p className="text-sm">Date of Birth</p>
                </div>
                <p className="font-medium text-sm w-2/3">
                  {userInfo.dateOfBirthRaw ? formatDate(userInfo.dateOfBirthRaw) : (userInfo.dateOfBirth || 'Not set')}
                </p>
              </motion.div>

              {/* Address - Full width on mobile, half width on PC */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors md:col-span-2"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <MapPinIcon className="w-5 h-5" />
                  <p className="text-sm">Address</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.address || 'Not set'}</p>
              </motion.div>

              {/* Bio - Full width on mobile, half width on PC */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 }}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors md:col-span-2"
              >
                <div className="flex items-center gap-2 text-gray-600 w-1/3">
                  <InformationCircleIcon className="w-5 h-5" />
                  <p className="text-sm">Bio</p>
                </div>
                <p className="font-medium text-sm w-2/3">{userInfo.bio || 'Not set'}</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Power Zones Section */}
      {(userInfo.powerZones?.cycling || userInfo.powerZones?.running) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="bg-white rounded-3xl shadow-sm overflow-hidden"
        >
          <div className="px-4 md:px-6 py-4 md:py-6">
            {/* Sport Selector */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Training Zones</h2>
              <div className="flex gap-2">
                {userInfo.powerZones?.cycling && (
                  <button
                    onClick={() => setSelectedZoneSport('cycling')}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                      selectedZoneSport === 'cycling'
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Cycling
                  </button>
                )}
                {userInfo.powerZones?.running && (
                  <button
                    onClick={() => setSelectedZoneSport('running')}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                      selectedZoneSport === 'running'
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Running
                  </button>
                )}
              </div>
            </div>

            {/* Cycling Zones */}
            {userInfo.powerZones?.cycling && selectedZoneSport === 'cycling' && (
              <>
                {userInfo.powerZones?.cycling?.lastUpdated && (
                  <p className="text-xs text-gray-500 mb-4">
                    Updated: {new Date(userInfo.powerZones.cycling.lastUpdated).toLocaleDateString()}
                  </p>
                )}

            {/* LTP1 and LTP2 */}
            {(userInfo.powerZones.cycling.lt1 || userInfo.powerZones.cycling.lt2) && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                {userInfo.powerZones.cycling.lt1 && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">LTP1</p>
                    <p className="text-2xl font-bold text-blue-700">{userInfo.powerZones.cycling.lt1}W</p>
                  </div>
                )}
                {userInfo.powerZones.cycling.lt2 && (
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">LTP2 (FTP)</p>
                    <p className="text-2xl font-bold text-purple-700">{userInfo.powerZones.cycling.lt2}W</p>
                  </div>
                )}
              </div>
            )}

            {/* Zones Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Zone</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Power Range (W)</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 hidden md:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map(zoneNum => {
                    const zone = userInfo.powerZones.cycling[`zone${zoneNum}`];
                    if (!zone || (!zone.min && !zone.max)) return null;
                    
                    const zoneColors = {
                      1: 'bg-blue-50 text-blue-700',
                      2: 'bg-green-50 text-green-700',
                      3: 'bg-yellow-50 text-yellow-700',
                      4: 'bg-orange-50 text-orange-700',
                      5: 'bg-red-50 text-red-700'
                    };
                    
                    return (
                      <tr key={zoneNum} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${zoneColors[zoneNum]}`}>
                            {zoneNum}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm">
                            {zone.min || 0}-{zone.max === Infinity || zone.max === null || zone.max === undefined ? '∞' : `${zone.max}`}W
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 hidden md:table-cell">
                          {zone.description || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

                {(!userInfo.powerZones.cycling.zone1 || !userInfo.powerZones.cycling.zone1.min) && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      No cycling zones configured. Edit your profile to set power zones from your lactate test.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Running Zones */}
            {userInfo.powerZones?.running && selectedZoneSport === 'running' && (
              <>
                {userInfo.powerZones?.running?.lastUpdated && (
                  <p className="text-xs text-gray-500 mb-4">
                    Updated: {new Date(userInfo.powerZones.running.lastUpdated).toLocaleDateString()}
                  </p>
                )}

                {/* LTP1 and LTP2 for Running */}
                {(userInfo.powerZones.running.lt1 || userInfo.powerZones.running.lt2) && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {userInfo.powerZones.running.lt1 && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">LTP1</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {formatPace(userInfo.powerZones.running.lt1)} /km
                        </p>
                      </div>
                    )}
                    {userInfo.powerZones.running.lt2 && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">LTP2</p>
                        <p className="text-2xl font-bold text-purple-700">
                          {formatPace(userInfo.powerZones.running.lt2)} /km
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Running Zones Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Zone</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Pace Range (/km)</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 hidden md:table-cell">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5].map(zoneNum => {
                        const zone = userInfo.powerZones.running[`zone${zoneNum}`];
                        if (!zone || (!zone.min && !zone.max)) return null;
                        
                        const zoneColors = {
                          1: 'bg-blue-50 text-blue-700',
                          2: 'bg-green-50 text-green-700',
                          3: 'bg-yellow-50 text-yellow-700',
                          4: 'bg-orange-50 text-orange-700',
                          5: 'bg-red-50 text-red-700'
                        };
                        
                        return (
                          <tr key={zoneNum} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${zoneColors[zoneNum]}`}>
                                {zoneNum}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-sm">
                                {formatPace(zone.min || 0)}-{zone.max === Infinity || zone.max === null || zone.max === undefined ? '∞' : formatPace(zone.max)} /km
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600 hidden md:table-cell">
                              {zone.description || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {(!userInfo.powerZones.running.zone1 || !userInfo.powerZones.running.zone1.min) && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      No running zones configured. Edit your profile to set pace zones from your lactate test.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}

      {userInfo.role !== 'coach' && (
        <>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
          >
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
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="lg:col-span-2"
          >
            <div className="mb-4">
              <SportsSelector onSportChange={setSelectedTestingSport} />
            </div>
            <PreviousTestingComponent 
              selectedSport={selectedTestingSport}
              tests={tests}
              setTests={setTests}
              athleteId={userInfo._id}
            />
          </motion.div>
        </>
      )}

      <AnimatePresence>
        {isEditModalOpen && (
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleProfileUpdate}
        userData={userInfo}
      />
        )}

        {isPasswordModalOpen && (
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ProfilePage;