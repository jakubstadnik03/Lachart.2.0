import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { MagnifyingGlassIcon, EllipsisVerticalIcon, UserPlusIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { getAthleteAvatar } from '../utils/avatarUtils';
import CoachAthleteOverview from '../components/Athletes/CoachAthleteOverview';
import Modal from '../components/Modal';
import { useAthleteSelection } from '../context/AthleteSelectionContext';

const AthletesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setSelectedAthleteId } = useAthleteSelection();
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
    gender: 'male',
    notes: '',
  });
  const { addNotification } = useNotification();
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'overview'
  const [formTab, setFormTab] = useState('info'); // 'info' | 'physical' | 'notes'

  const notifyAthletesUpdated = () => {
    window.dispatchEvent(new CustomEvent('coachAthletesUpdated'));
    window.dispatchEvent(new CustomEvent('athleteListUpdated'));
  };

  useEffect(() => {
    const loadAthletes = async () => {
      if (!['coach', 'tester', 'testing'].includes(user?.role)) {
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

  if (!['coach', 'tester', 'testing'].includes(user?.role)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-190px)]">
        <p className="text-gray-500">This page is only available for coaches.</p>
      </div>
    );
  }


  const handleViewProfile = (athleteId) => {
    const athlete = athletes.find(a => String(a._id) === String(athleteId));
    if (athlete?.invitationPending || athlete?.coachLinkStatus === 'pending') {
      addNotification('Waiting for athlete confirmation before profile access.', 'info');
      return;
    }
    setSelectedAthleteId(athleteId);
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
      gender: athlete.gender || 'male',
      notes: athlete.notes || '',
    });
    setIsModalOpen(true);
    setDropdownOpen(null);
  };

  const handleRemoveAthlete = async (athleteId) => {
    // Get athlete name for confirmation message
    const athlete = athletes.find(a => a._id === athleteId);
    const athleteName = athlete ? `${athlete.name} ${athlete.surname}` : 'this athlete';
    
    // Show confirmation dialog
    if (window.confirm(`Are you sure you want to remove ${athleteName}? This action cannot be undone.`)) {
      try {
        await api.delete(`/user/coach/remove-athlete/${athleteId}`);
        setAthletes(athletes.filter(athlete => athlete._id !== athleteId));
        notifyAthletesUpdated();
        setDropdownOpen(null);
        addNotification('Athlete removed successfully', 'success');
      } catch (error) {
        console.error('Error removing athlete:', error);
        const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to remove athlete';
        addNotification(errorMessage, 'error');
      }
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
        notifyAthletesUpdated();
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
        notifyAthletesUpdated();
        addNotification('Athlete updated successfully', 'success');
        setIsModalOpen(false);
        setSelectedAthlete(null);
        resetForm();
      } else {
        // Přidání nového atleta
        try {
          const emailValue = formData.email?.trim() || undefined;
          const response = await api.post('/user/coach/add-athlete', {
            name: formData.name,
            surname: formData.surname,
            email: emailValue,
            dateOfBirth: formattedDate,
            address: formData.address,
            phone: formData.phone,
            height: formData.height ? Number(formData.height) : null,
            weight: formData.weight ? Number(formData.weight) : null,
            sport: formData.sport,
            specialization: formData.specialization,
            gender: formData.gender || 'male'
          });
          
          setAthletes([...athletes, response.data.athlete]);
          notifyAthletesUpdated();
          addNotification(
            emailValue
              ? 'Athlete added successfully and invitation sent'
              : 'Athlete added successfully (no email – no invitation sent)',
            'success'
          );
          // Zavření modalu a reset formuláře
          setIsModalOpen(false);
          setSelectedAthlete(null);
          resetForm();
        } catch (error) {
          console.error('Error adding athlete:', error);
          let errorMessage = 'An unexpected error occurred';
          
          if (error.response) {
            // Server responded with an error
            errorMessage = error.response.data.error || error.response.data.message || 'Failed to add athlete';
          } else if (error.request) {
            // Request was made but no response received
            errorMessage = 'No response from server. Please check your internet connection.';
          } else {
            // Something else happened
            errorMessage = error.message || 'An unexpected error occurred';
          }
          
          addNotification(errorMessage, 'error');
          // Keep the modal open so user can fix the error
          setIsModalOpen(true);
        }
      }
    } catch (error) {
      console.error('Error submitting athlete:', error);
      let errorMessage = 'An unexpected error occurred';
      
      if (error.response) {
        // Server responded with an error
        errorMessage = error.response.data.error || error.response.data.message || 'Failed to save athlete';
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'No response from server. Please check your internet connection.';
      } else {
        // Something else happened
        errorMessage = error.message || 'An unexpected error occurred';
      }
      
      addNotification(errorMessage, 'error');
      // Keep the modal open so user can fix the error
      setIsModalOpen(true);
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
      gender: 'male',
      notes: '',
    });
    setFormTab('info');
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
        notifyAthletesUpdated();
        addNotification('Athlete added to your team and invitation email sent.', 'success');
        setIsInviteModalOpen(false);
        setInviteEmail('');
      }
    } catch (error) {
      setInviteError(error.response?.data?.error || 'Error adding athlete');
    }
  };

  return (
    <>
    <div className="min-h-screen py-4 sm:py-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100">
            {/* Header row */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Athletes</h1>
                <p className="text-xs text-gray-400 mt-0.5">{athletes.length} athlete{athletes.length !== 1 ? 's' : ''} in your team</p>
              </div>
              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="hidden sm:flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'cards' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Cards
                  </button>
                  <button
                    onClick={() => setViewMode('overview')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'overview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Overview
                  </button>
                </div>
                <button
                  onClick={() => setIsInviteModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <UsersIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Existing</span>
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  data-tour="tour-add-athlete"
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl text-xs font-medium hover:bg-primary-dark transition-colors shadow-sm"
                >
                  <UserPlusIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Athlete</span>
                  <span className="sm:hidden">Add</span>
                </button>
              </div>
            </div>

            {/* Search + mobile view toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search athletes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Mobile view toggle */}
              <div className="flex sm:hidden bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'cards' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('overview')}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'overview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">

              {viewMode === 'overview' ? (
                <CoachAthleteOverview athletes={filteredAthletes} />
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAthletes.length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-400 text-sm">
                    No athletes found. <button onClick={() => setIsModalOpen(true)} className="text-primary underline">Add one</button>
                  </div>
                )}
                {filteredAthletes.map((athlete) => {
                  const isPending = Boolean(athlete.invitationPending || athlete.coachLinkStatus === 'pending');
                  const dropdownMenu = dropdownOpen === athlete._id && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-[100]">
                      <button onClick={() => handleEditAthlete(athlete)} className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">Edit Athlete</button>
                      {!athlete.isRegistrationComplete && (
                        <button onClick={() => handleResendInvitation(athlete._id)} className="block w-full text-left px-4 py-2.5 text-sm text-blue-600 hover:bg-gray-50">Resend Invitation</button>
                      )}
                      <button onClick={() => handleRemoveAthlete(athlete._id)} className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-gray-50">Remove Athlete</button>
                    </div>
                  );

                  return (
                    <div key={athlete._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                      {/* ── Mobile: compact horizontal row ── */}
                      <div className="sm:hidden flex items-center gap-3 px-4 py-3">
                        {/* Avatar */}
                        <button onClick={() => handleViewProfile(athlete._id)} style={{ touchAction: 'manipulation' }}>
                          <div className="w-14 h-14 rounded-2xl bg-purple-50 overflow-hidden shrink-0 border border-purple-100">
                            <img src={getAthleteAvatar(athlete)} alt="" className="w-full h-full object-cover" />
                          </div>
                        </button>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => handleViewProfile(athlete._id)}
                            className="font-semibold text-gray-900 text-sm text-left leading-tight block truncate w-full hover:text-primary transition-colors"
                            style={{ touchAction: 'manipulation' }}
                          >
                            {athlete.name} {athlete.surname}
                          </button>
                          {athlete.email && <p className="text-xs text-gray-400 truncate mt-0.5">{athlete.email}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {athlete.sport && (
                              <span className="text-[11px] px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium">{athlete.sport}</span>
                            )}
                            {athlete.height && athlete.weight && (
                              <span className="text-[11px] text-gray-400">{athlete.height}cm · {athlete.weight}kg</span>
                            )}
                            {isPending && (
                              <span className="text-[11px] text-amber-600 font-medium">⏳ Waiting</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="dropdown-container relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDropdownOpen(dropdownOpen === athlete._id ? null : athlete._id); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <EllipsisVerticalIcon className="w-5 h-5" />
                            </button>
                            {dropdownMenu}
                          </div>
                          <button
                            onClick={() => handleViewProfile(athlete._id)}
                            disabled={isPending}
                            className="text-xs font-semibold text-primary disabled:opacity-40 flex items-center gap-0.5"
                            style={{ touchAction: 'manipulation' }}
                          >
                            Profile
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* ── Desktop: original tall card ── */}
                      <div className="hidden sm:flex flex-col">
                        <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-50 relative">
                          <div className="absolute top-4 right-4 dropdown-container">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDropdownOpen(dropdownOpen === athlete._id ? null : athlete._id); }}
                              className="p-1.5 rounded-lg bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              <EllipsisVerticalIcon className="w-5 h-5" />
                            </button>
                            {dropdownMenu}
                          </div>
                        </div>
                        <div className="px-6 pb-6 flex-grow flex flex-col">
                          <div className="flex justify-center -mt-16">
                            <div className="w-32 h-32 rounded-full bg-gray-200 border-4 border-white overflow-hidden relative z-10">
                              <img src={getAthleteAvatar(athlete)} alt={`${athlete.name}'s avatar`} className="w-full h-full object-cover" />
                            </div>
                          </div>
                          <div className="text-center mt-4">
                            <h3 className="text-2xl font-bold text-gray-900 hover:text-primary-dark cursor-pointer" onClick={() => handleViewProfile(athlete._id)}>
                              {athlete.name} {athlete.surname}
                            </h3>
                            {isPending && <p className="text-sm text-amber-700 mt-1 font-medium">Waiting for confirmation</p>}
                            <p className="text-base text-gray-500 mt-1">{athlete.email}</p>
                          </div>
                          <div className="mt-6 grid grid-cols-2 gap-4 flex-grow">
                            <div className="bg-purple-50 rounded-2xl p-4">
                              <div className="text-xl font-semibold text-secondary">{athlete.sport || '—'}</div>
                              <div className="text-sm text-gray-500 mt-1">{athlete.specialization || ''}</div>
                            </div>
                            <div className="bg-purple-50 rounded-2xl p-4">
                              <div className="text-xl font-semibold text-primary">{formatDate(athlete.dateOfBirth)}</div>
                              <div className="text-sm text-gray-500 mt-1">
                                {[athlete.height && `${athlete.height} cm`, athlete.weight && `${athlete.weight} kg`].filter(Boolean).join(' · ') || ''}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleViewProfile(athlete._id)}
                            disabled={isPending}
                            className="w-full mt-6 bg-primary text-white py-3 rounded-xl hover:bg-primary-dark transition-colors text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isPending ? 'Waiting for confirmation' : 'View Profile'}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
              )}
            </div>{/* /content */}
          </div>{/* /card */}
        </div>{/* /max-w */}
      </div>{/* /page */}

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedAthlete(null); resetForm(); }}
        title={selectedAthlete ? 'Edit Athlete' : 'Add New Athlete'}
      >
        {(() => {
          const ic = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';
          const lc = 'block text-xs font-medium text-gray-600 mb-1';
          const TABS = [
            { id: 'info',     label: 'Info' },
            { id: 'physical', label: 'Physical' },
            { id: 'notes',    label: 'Notes' },
          ];
          return (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {/* Tab switcher */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormTab(t.id)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      formTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Info ── */}
              {formTab === 'info' && (
                <div className="space-y-3">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-purple-50 overflow-hidden shrink-0 border border-purple-100 flex items-center justify-center">
                      {formData.sport || formData.gender ? (
                        <img src={getAthleteAvatar({ sport: formData.sport, gender: formData.gender || 'male' })} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400 text-center px-1 leading-tight">Select sport for avatar</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 leading-relaxed">Avatar is generated automatically based on sport &amp; gender.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lc}>Name<span className="text-orange-500">*</span></label>
                      <input type="text" name="name" required value={formData.name} onChange={handleInputChange} className={ic} placeholder="First name" />
                    </div>
                    <div>
                      <label className={lc}>Surname<span className="text-orange-500">*</span></label>
                      <input type="text" name="surname" required value={formData.surname} onChange={handleInputChange} className={ic} placeholder="Last name" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lc}>Date of Birth</label>
                      <input type="date" name="dateOfBirth" value={formData.dateOfBirth ? formData.dateOfBirth.split('.').reverse().join('-') : ''} onChange={handleInputChange} className={ic} max={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div>
                      <label className={lc}>Gender</label>
                      <select name="gender" value={formData.gender} onChange={handleInputChange} className={ic}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={lc}>Email <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={ic} placeholder="Leave empty — no invitation sent" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lc}>Phone</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className={ic} placeholder="+420…" />
                    </div>
                    <div>
                      <label className={lc}>Address</label>
                      <input type="text" name="address" value={formData.address} onChange={handleInputChange} className={ic} placeholder="City" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Physical ── */}
              {formTab === 'physical' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lc}>Weight (kg)</label>
                      <input type="text" name="weight" value={formData.weight} onChange={handleInputChange} className={ic} placeholder="70" />
                    </div>
                    <div>
                      <label className={lc}>Height (cm)</label>
                      <input type="text" name="height" value={formData.height} onChange={handleInputChange} className={ic} placeholder="175" />
                    </div>
                  </div>

                  <div>
                    <label className={lc}>Sport</label>
                    <select name="sport" value={formData.sport} onChange={handleInputChange} className={ic}>
                      <option value="">Select sport</option>
                      <option value="triathlon">Triathlon</option>
                      <option value="running">Running</option>
                      <option value="swimming">Swimming</option>
                      <option value="cycling">Cycling</option>
                    </select>
                  </div>

                  <div>
                    <label className={lc}>Specialization</label>
                    <input type="text" name="specialization" value={formData.specialization} onChange={handleInputChange} className={ic} placeholder="e.g. Sprint, Long Distance, Road" />
                  </div>
                </div>
              )}

              {/* ── Tab: Notes ── */}
              {formTab === 'notes' && (
                <div>
                  <label className={lc}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={7} className={ic} placeholder="Any notes about this athlete — goals, injuries, history…" />
                </div>
              )}

              {/* Footer — always visible */}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setSelectedAthlete(null); resetForm(); }}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold shadow-md hover:bg-primary-dark transition-colors"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  {selectedAthlete ? 'Save Changes' : 'Add Athlete'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* Invite Athlete Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => { setIsInviteModalOpen(false); setInviteEmail(''); setInviteError(''); }}
        title="Add Existing Athlete"
      >
        <form onSubmit={handleInviteAthlete} className="space-y-4">
          <p className="text-sm text-gray-500">
            Enter the email of an athlete who already has a LaChart account. They'll receive an invitation to join your team.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Athlete Email<span className="text-orange-500">*</span>
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="athlete@example.com"
            />
          </div>

          {inviteError && (
            <p className="text-xs text-red-500 text-center">{inviteError}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setIsInviteModalOpen(false); setInviteEmail(''); setInviteError(''); }}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-md hover:bg-primary-dark transition-colors"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              Send Invitation
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default AthletesPage;