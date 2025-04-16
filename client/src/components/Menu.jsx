import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const Menu = ({ isMenuOpen, setIsMenuOpen }) => {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, token, logout } = useAuth();
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.split('/')[1];
  const currentAthleteId = location.pathname.split('/')[2];

  // Ensure menu is open when component mounts
  useEffect(() => {
    if (user && token) {
      setIsMenuOpen(true);
    }
  }, [user, token, setIsMenuOpen]);

  useEffect(() => {
    const loadAthletes = async () => {
      if (user?.role === "coach") {
        try {
          setLoading(true);
          const response = await api.get('/user/coach/athletes');
          setAthletes(response.data);
        } catch (error) {
          console.error('Error loading athletes:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    if (user && token) {
      loadAthletes();
    }
  }, [user, token]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  }, [location.pathname, setIsMenuOpen]);

  const handleMenuItemClick = () => {
    if (window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  };

  const handleAthleteClick = async (athleteId) => {
    try {
      if (window.innerWidth < 768) {
        setIsMenuOpen(false);
      }

      // Pokud jsme na stránce athletes nebo profile, přesměrujeme na profil atleta
      if (currentPath === 'athletes' || currentPath === 'profile') {
        navigate(`/athlete/${athleteId}`, { replace: true });
        return;
      }

      // Pokud klikneme na stejného atleta, zrušíme výběr
      if (currentAthleteId === athleteId) {
        navigate(`/${currentPath}`, { replace: true });
        return;
      }

      // Pro ostatní stránky přidáme ID atleta do URL
      navigate(`/${currentPath}/${athleteId}`, { replace: true });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (currentPath === 'dashboard') {
        const response = await api.get(`/user/athlete/${athleteId}/trainings`);
        window.dispatchEvent(new CustomEvent('athleteChanged', { 
          detail: { 
            athleteId,
            trainings: response.data 
          }
        }));
      } else if (currentPath === 'training') {
        const response = await api.get(`/user/athlete/${athleteId}/trainings`);
        window.dispatchEvent(new CustomEvent('athleteChanged', { 
          detail: { 
            athleteId,
            trainings: response.data 
          }
        }));
      } else if (currentPath === 'testing') {
        const response = await api.get(`/testing/athlete/${athleteId}`);
        window.dispatchEvent(new CustomEvent('athleteChanged', { 
          detail: { 
            athleteId,
            tests: response.data 
          }
        }));
      }
    } catch (error) {
      console.error('Error changing athlete:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/user/logout');
      logout();
      setIsMenuOpen(false);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Funkce pro určení avataru podle role a sportu
  const getAvatar = (user) => {
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

  // Definice položek menu s dynamickými cestami pro trenéra
  const menuItems = [
    {
      name: "Dashboard",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/dashboard/${athleteId}` : "/dashboard",
      icon: "/icon/dashboard.svg",
      iconWhite: "/icon/dashboard-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Training",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/training/${athleteId}` : "/training",
      icon: "/icon/training.svg",
      iconWhite: "/icon/training-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Testing",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/testing/${athleteId}` : "/testing",
      icon: "/icon/testing.svg",
      iconWhite: "/icon/testing-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Athletes",
      path: "/athletes",
      icon: "/icon/athletes.svg",
      iconWhite: "/icon/athletes-white.svg",
      showFor: ["coach"]
    },
    {
      name: "Profile",
      path: "/profile",
      icon: "/icon/profile.svg",
      iconWhite: "/icon/profile-white.svg",
      showFor: ["coach", "athlete"]
    }
  ];

  return (
    <>
      <motion.div 
        ref={menuRef}
        initial={{ x: -300, opacity: 0 }}
        animate={{ 
          x: isMenuOpen ? 0 : -300,
          opacity: isMenuOpen ? 1 : 0
        }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          opacity: { duration: 0.2 }
        }}
        className={`fixed md:sticky top-0 left-0 h-screen w-64 min-w-[16rem] bg-white shadow-md flex flex-col font-sans z-40`}
      >
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            delay: 0.2,
            type: "spring",
            stiffness: 200,
            damping: 20
          }}
          className="flex items-center justify-center h-16 border-b border-gray-200 flex-shrink-0"
        >
          <img src="/images/LaChart.png" alt="LaChart Logo" className="w-10 h-8 mr-2 object-contain" />
          <h1 className="text-xl font-bold text-primary">LaChart</h1>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            delay: 0.3,
            type: "spring",
            stiffness: 200,
            damping: 20
          }}
          className="p-4 flex items-center border-b border-gray-200 flex-shrink-0"
        >
          <img
            src={getAvatar(user)}
            alt="User Avatar"
            className="w-12 h-12 rounded-full"
          />
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-800">
              {user.name} {user.surname}
            </p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="p-4 flex-shrink-0"
        >
          <h2 className="text-lg text-gray-700 mb-3">Menu</h2>
          <ul className="space-y-2">
            {menuItems
              .filter(item => item.showFor.includes(user.role))
              .map((item, index) => (
                <motion.li 
                  key={item.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ 
                    delay: 0.1 * index,
                    type: "spring",
                    stiffness: 200,
                    damping: 20
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <NavLink
                    to={item.getPath ? item.getPath(currentAthleteId) : item.path}
                    onClick={handleMenuItemClick}
                    className={({ isActive }) =>
                      `flex items-center text-sm font-medium p-3 rounded-lg ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <img
                          src={isActive ? item.iconWhite : item.icon}
                          alt={item.name}
                          className="w-5 h-5 mr-3"
                        />
                        {item.name}
                      </>
                    )}
                  </NavLink>
                </motion.li>
              ))}
          </ul>
        </motion.div>

        {user.role === "coach" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="p-4 border-t border-gray-200 flex-1 overflow-y-auto"
          >
            <h2 className="text-sm font-bold text-gray-700 mb-3">Athletes</h2>
            {loading ? (
              <div className="text-sm text-gray-500">Načítání atletů...</div>
            ) : athletes.length > 0 ? (
              <ul className="space-y-2">
                {athletes.map((athlete, index) => (
                  <motion.li 
                    key={athlete._id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: 0.1 * index,
                      type: "spring",
                      stiffness: 200,
                      damping: 20
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.button
                      whileHover={{ 
                        scale: 1.02,
                        backgroundColor: currentAthleteId === athlete._id && currentPath !== 'athletes'
                          ? "rgb(237, 233, 254)"
                          : "rgb(243, 244, 246)"
                      }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAthleteClick(athlete._id)}
                      className={`w-full text-left flex items-center p-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        currentAthleteId === athlete._id && currentPath !== 'athletes'
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <img
                        src={getAvatar(athlete)}
                        alt="Athlete"
                        className="w-6 h-6 rounded-full mr-2"
                      />
                      {athlete.name} {athlete.surname}
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500">Žádní atleti nejsou k dispozici</div>
            )}
          </motion.div>
        )}

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-auto flex-shrink-0"
        >
          <div className="p-4 border-t border-gray-200">
            <ul className="space-y-2">
              <motion.li
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `flex items-center text-sm font-medium p-3 rounded-lg ${
                      isActive
                        ? "bg-primary text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <img
                        src={isActive ? "/icon/settings-white.svg" : "/icon/settings.svg"}
                        alt="Settings"
                        className="w-5 h-5 mr-3"
                      />
                      Settings
                    </>
                  )}
                </NavLink>
              </motion.li>
              <motion.li
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <NavLink
                  to="/support"
                  className={({ isActive }) =>
                    `flex items-center text-sm font-medium p-3 rounded-lg ${
                      isActive
                        ? "bg-primary text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <img
                        src={isActive ? "/icon/support-white.svg" : "/icon/support.svg"}
                        alt="Support"
                        className="w-5 h-5 mr-3"
                      />
                      Support
                    </>
                  )}
                </NavLink>
              </motion.li>
            </ul>
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="p-4 border-t border-gray-200"
            style={{ paddingTop: '0.35rem', paddingBottom: '0.35rem' }}
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLogout}
              className="flex items-center w-full text-sm font-medium p-3 rounded-lg text-red-600 hover:bg-red-50"
            >
              <img
                src="/icon/logout.svg"
                alt="Logout"
                className="w-5 h-5 mr-3"
              />
              Log out
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
      
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Menu;
