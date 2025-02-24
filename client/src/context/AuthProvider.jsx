"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { mockUsers } from '../mock/users';
import { setMockUser, getMockUser } from '../mock/mockApi';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      navigate('/login');
    } else {
      setIsAuthenticated(true);
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  const login = (email) => {
    const user = mockUsers.find(u => u.email === email);
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      setIsAuthenticated(true);
      setCurrentUser(user);
      navigate('/dashboard');
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext); 