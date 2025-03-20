import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';

export function UserDropdown({isOpen, setIsOpen }) {
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  // Funkce pro určení avataru podle role a sportu
  const getAvatar = (user) => {
    if (user.role === 'coach') {
      return '/images/coach-avatar.webp';
    }
    
    // Pro atlety podle sportu
    const sportAvatars = {
      triathlon: '/images/triathlete-avatar.jpg',
      running: '/images/runner-avatar.jpg',
      cycling: '/images/cyclist-avatar.webp',
      swimming: '/images/swimmer-avatar.jpg'
    };

    return user.avatar || sportAvatars[user.sport?.toLowerCase()] || '/images/triathlete-avatar.jpg';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-gray-100 rounded-full p-1"
      >
        <img
          src={getAvatar(user)}
          alt="User"
          className="w-8 h-8 rounded-full"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100">
          {/* User Info */}
          <div className="p-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {user.name} {user.surname}
              </h3>
              <p className="text-sm text-gray-600">{user.role}</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <img src="/icon/close.svg" alt="Close" className="w-4 h-4" />
            </button>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            <button
              onClick={() => {
                navigate('/profile');
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-gray-50 rounded-lg"
            >
              <img src="/icon/user.svg" alt="Profile" className="w-5 h-5" />
              My Profile
            </button>
            
            <button
              onClick={() => {
                navigate('/settings');
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-gray-50 rounded-lg"
            >
              <img src="/icon/settings.svg" alt="Settings" className="w-5 h-5" />
              Setting
            </button>

            <button
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-red-50 text-red-600 rounded-lg"
            >
              <img src="/icon/logout.svg" alt="Logout" className="w-5 h-5" />
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 