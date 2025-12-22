import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';

export const UserDropdown = ({ isOpen, setIsOpen, user: propUser, disabled }) => {
  const dropdownRef = useRef(null);
  const { user: authUser, logout } = useAuth();

  // Use prop user if provided, otherwise use auth user
  const user = propUser || authUser;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      setIsOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Funkce pro určení avataru podle role a sportu
  const getAvatar = (user) => {
    // Default avatar for demo mode or when user data is empty
    if (!user || !user.role) {
      return '/images/triathlete-avatar.jpg';
    }

    // If user has an avatar (e.g., from Strava), use it first
    if (user.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://'))) {
      return user.avatar;
    }

    if (user.role === 'coach') {
      return '/images/coach-avatar.webp';
    }
    
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
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={disabled}
      >
        <img
          src={getAvatar(user)}
          alt="User Avatar"
          className="w-8 h-8 rounded-full"
        />
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-700">
            {user?.name || 'Demo'} {user?.surname || 'User'}
          </p>
          <p className="text-xs text-gray-500">{user?.email || 'demo@example.com'}</p>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50"
          >
            <Link
              to="/profile"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setIsOpen(false)}
            >
              Profile
            </Link>
            <Link
              to="/settings"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setIsOpen(false)}
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
            >
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 