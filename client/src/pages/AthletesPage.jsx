import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { motion } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';

const AthletesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
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
    const loadAthletes = async () => {
      if (user?.role !== 'coach') {
        return;
      }
      
      try {
        const response = await api.get('/user/coach/athletes');
        setAthletes(response.data);
      } catch (error) {
        console.error('Error loading athletes:', error);
        // Handle error appropriately
      }
    };

    loadAthletes();
  }, [user?.role]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.dropdown-container')) {
        setDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const filteredAthletes = athletes.filter(athlete => 
    `${athlete.name} ${athlete.surname}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (user?.role !== 'coach') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-190px)]">
        <p className="text-gray-500">This page is only available for coaches.</p>
      </div>
    );
  }

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
        return null;
    }
  };

  const handleViewProfile = (athleteId) => {
    navigate(`/athlete/${athleteId}`);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'dateOfBirth') {
      // Převod data z HTML date input (YYYY-MM-DD) na formát DD.MM.YYYY
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

  const handleEditAthlete = (athlete) => {
    setSelectedAthlete(athlete);
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
    setDropdownOpen(null);
  };

  const handleRemoveAthlete = async (athleteId) => {
    try {
      await api.delete(`/user/athlete/${athleteId}`);
      setAthletes(athletes.filter(athlete => athlete._id !== athleteId));
      setDropdownOpen(null);
      addNotification('Athlete removed successfully', 'success');
    } catch (error) {
      console.error('Error removing athlete:', error);
      addNotification('Failed to remove athlete', 'error');
    }
  };

  const handleResendInvitation = async (athleteId) => {
    try {
      const response = await api.post(`/user/coach/resend-invitation/${athleteId}`);
      if (response.data.success) {
        addNotification('Invitation resent successfully', 'success');
        // Aktualizovat stav atleta v seznamu
        setAthletes(athletes.map(athlete => 
          athlete._id === athleteId 
            ? { ...athlete, isRegistrationComplete: false }
            : athlete
        ));
      } else {
        addNotification('Error resending invitation: ' + response.data.message, 'error');
      }
      setDropdownOpen(null);
    } catch (error) {
      console.error('Error resending invitation:', error);
      const errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred';
      addNotification('Error resending invitation: ' + errorMessage, 'error');
      setDropdownOpen(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Konverze data z DD.MM.YYYY na YYYY-MM-DD
      const formattedDate = formData.dateOfBirth ? 
        formData.dateOfBirth.split('.').reverse().join('-') : 
        null;

      if (selectedAthlete) {
        // Update existujícího atleta
        const response = await api.put(`/user/coach/edit-athlete/${selectedAthlete._id}`, {
          ...formData,
          dateOfBirth: formattedDate
        });
        setAthletes(athletes.map(athlete => 
          athlete._id === selectedAthlete._id ? response.data.athlete : athlete
        ));
        addNotification('Athlete updated successfully', 'success');
      } else {
        // Přidání nového atleta
        const response = await api.post('/user/coach/add-athlete', {
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          dateOfBirth: formattedDate,
          address: formData.address,
          phone: formData.phone,
          height: formData.height ? Number(formData.height) : null,
          weight: formData.weight ? Number(formData.weight) : null,
          sport: formData.sport,
          specialization: formData.specialization
        });
        
        if (response.data.success) {
          setAthletes([...athletes, response.data.athlete]);
          addNotification('Athlete added successfully and invitation sent', 'success');
        } else {
          addNotification('Error adding athlete: ' + response.data.message, 'error');
        }
      }
      setIsModalOpen(false);
      setSelectedAthlete(null);
      resetForm();
    } catch (error) {
      console.error('Error submitting athlete:', error);
      const errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred';
      addNotification('Error saving athlete: ' + errorMessage, 'error');
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

  // Funkce pro formátování data
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Pokud není validní datum, vrátí původní string
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    return `${day}.${month}.${year}`;
  };

  const handleInviteAthlete = async (e) => {
    e.preventDefault();
    setInviteError('');
    
    try {
      const response = await api.post('/user/coach/invite-athlete', { email: inviteEmail });
      if (response.data.athlete) {
        setAthletes([...athletes, response.data.athlete]);
        alert('Atlet byl úspěšně přidán do týmu a byla mu odeslána pozvánka');
        setIsInviteModalOpen(false);
        setInviteEmail('');
      }
    } catch (error) {
      setInviteError(error.response?.data?.error || 'Chyba při přidávání atleta');
    }
  };

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
                  List of athletes
                </motion.h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search athletes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsModalOpen(true)}
                    className="w-full sm:w-auto bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors text-sm sm:text-base"
                  >
                    Add New Athlete
                  </motion.button>
                </div>
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
              >
                {filteredAthletes.map((athlete, index) => (
                  <motion.div
                    key={athlete._id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1.4 + index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden"
                  >
                    <div className="h-24 sm:h-32 bg-gradient-to-r from-purple-100 to-purple-50 relative">
                      <div className="absolute top-2 sm:top-4 right-2 sm:right-4 dropdown-container">
                        <button 
                          onClick={() => setDropdownOpen(athlete._id)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          •••
                        </button>
                        {dropdownOpen === athlete._id && (
                          <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-white rounded-lg shadow-lg py-1 z-50">
                            <button
                              onClick={() => handleEditAthlete(athlete)}
                              className="block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Edit Athlete
                            </button>
                            {!athlete.isRegistrationComplete && (
                              <button
                                onClick={() => handleResendInvitation(athlete._id)}
                                className="block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm text-blue-600 hover:bg-gray-100"
                              >
                                Resend Invitation
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveAthlete(athlete._id)}
                              className="block w-full text-left px-3 sm:px-4 py-2 text-xs sm:text-sm text-red-600 hover:bg-gray-100"
                            >
                              Remove Athlete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                      <div className="flex justify-center -mt-12 sm:-mt-16">
                        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gray-200 border-4 border-white overflow-hidden relative z-10">
                          <img
                            src={getAvatarBySport(athlete.sport)}
                            alt={`${athlete.name}'s avatar`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="text-center mt-3 sm:mt-4">
                        <h3 
                          className="text-lg sm:text-2xl font-bold text-gray-900 hover:text-primary-dark cursor-pointer"
                          onClick={() => handleViewProfile(athlete._id)}
                        >
                          {athlete.name} {athlete.surname}
                        </h3>
                        <p className="text-sm sm:text-base text-gray-500 mt-1">{athlete.email}</p>
                      </div>
                      <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                          <div className="text-base sm:text-xl font-semibold text-secondary">{athlete.sport}</div>
                          <div className="text-xs sm:text-sm text-gray-500 mt-1">{athlete.specialization}</div>
                        </div>
                        <div className="bg-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                          <div className="text-base sm:text-xl font-semibold text-primary ">{formatDate(athlete.dateOfBirth)}</div>
                          <div className="text-xs sm:text-sm text-gray-500 mt-1">{`${athlete.height} cm ${athlete.weight} kg`}</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleViewProfile(athlete._id)}
                        className="w-full mt-4 sm:mt-6 bg-primary text-white py-2 sm:py-3 rounded-xl hover:bg-primary-dark transition-colors text-sm sm:text-lg font-semibold flex items-center justify-center gap-2"
                      >
                        View Profile
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-3xl p-4 w-full max-w-2xl  overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">
                {selectedAthlete ? 'Edit Athlete' : 'Add New Athlete'}
              </h2>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedAthlete(null);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-[200px_1fr] gap-4">
                {/* Levá strana - Profile Image */}
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

                {/* Pravá strana - Základní údaje */}
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
                      max={new Date().toISOString().split('T')[0]} // Maximální datum je dnešní den
                    />
                  </div>
                </div>
              </div>

              {/* Spodní část formuláře */}
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
                    setSelectedAthlete(null);
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
                  {selectedAthlete ? 'Save Changes' : 'Add Athlete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Athlete Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-3xl p-4 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Přidat existujícího atleta</h2>
              <button 
                onClick={() => {
                  setIsInviteModalOpen(false);
                  setInviteEmail('');
                  setInviteError('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleInviteAthlete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email atleta<span className="text-orange-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  placeholder="Zadejte email atleta"
                />
              </div>

              {inviteError && (
                <div className="text-red-500 text-sm text-center">
                  {inviteError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setInviteEmail('');
                    setInviteError('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-dark"
                >
                  Odeslat pozvánku
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AthletesPage;