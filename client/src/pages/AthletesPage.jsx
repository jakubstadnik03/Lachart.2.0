import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AthletesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);
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
    notes: '',
  });

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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
    } catch (error) {
      console.error('Error removing athlete:', error);
      // TODO: Přidat notifikaci o chybě
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedAthlete) {
        // Update existujícího atleta
        const response = await api.put(`/user/athlete/${selectedAthlete._id}`, formData);
        setAthletes(athletes.map(athlete => 
          athlete._id === selectedAthlete._id ? response.data : athlete
        ));
      } else {
        // Přidání nového atleta
        const response = await api.post('/user/athlete/register', {
          ...formData,
          role: 'athlete'
        });
        setAthletes([...athletes, response.data]);
      }
      setIsModalOpen(false);
      setSelectedAthlete(null);
      resetForm();
    } catch (error) {
      console.error('Error submitting athlete:', error);
      // TODO: Přidat notifikaci o chybě
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">List of athletes</h1>
        <div className="flex items-center gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-full w-64 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-full flex items-center gap-2 hover:bg-purple-700 transition-colors"
          >
            <span className="text-lg">+</span>
            Add New Athlete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAthletes.map((athlete) => (
          <div key={athlete._id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-50 relative">
              <div className="absolute top-4 right-4 dropdown-container">
                <button 
                  onClick={() => setDropdownOpen(athlete._id)}
                  className="text-gray-600 hover:text-gray-800"
                >
                  •••
                </button>
                {dropdownOpen === athlete._id && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50">
                    <button
                      onClick={() => handleEditAthlete(athlete)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Edit Athlete
                    </button>
                    <button
                      onClick={() => handleRemoveAthlete(athlete._id)}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                    >
                      Remove Athlete
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6">
              <div className="flex justify-center -mt-16">
                <div className="w-32 h-32 rounded-full bg-gray-200 border-4 border-white overflow-hidden relative z-10">
                  <img
                    src={getAvatarBySport(athlete.sport)}
                    alt={`${athlete.name}'s avatar`}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="text-center mt-4">
                <h3 
                  className="text-2xl font-bold text-gray-900 hover:text-purple-600 cursor-pointer"
                  onClick={() => handleViewProfile(athlete._id)}
                >
                  {athlete.name} {athlete.surname}
                </h3>
                <p className="text-gray-500 mt-1">{athlete.email}</p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-purple-50 rounded-2xl p-4">
                  <div className="text-xl font-semibold text-purple-900">{athlete.sport}</div>
                  <div className="text-gray-500 text-sm mt-1">{athlete.specialization}</div>
                </div>
                <div className="bg-purple-50 rounded-2xl p-4">
                  <div className="text-xl font-semibold text-purple-900">{formatDate(athlete.dateOfBirth)}</div>
                  <div className="text-gray-500 text-sm mt-1">{`${athlete.height} cm ${athlete.weight} kg`}</div>
                </div>
              </div>
              <button 
                onClick={() => handleViewProfile(athlete._id)}
                className="w-full mt-6 bg-purple-600 text-white py-3 rounded-xl hover:bg-purple-700 transition-colors text-lg font-semibold flex items-center justify-center gap-2"
              >
                View Profile
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                      type="text"
                      name="dateOfBirth"
                      required
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                      placeholder="DD.MM.YY"
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
                  className="px-4 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                >
                  {selectedAthlete ? 'Save Changes' : 'Add Athlete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AthletesPage;