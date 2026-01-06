import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";
import TestingWithoutLogin from "../pages/TestingWithoutLogin";
import EditProfileModal from "./Profile/EditProfileModal";
import StravaConnectModal from "./Onboarding/StravaConnectModal";
import api from "../services/api";
import { useNotification } from "../context/NotificationContext";

const Layout = ({ isMenuOpen, setIsMenuOpen }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const { addNotification } = useNotification();

  // Ensure menu is open when component mounts
  useEffect(() => {
    if (user) {
      setIsMenuOpen(true);
    }
  }, [user, setIsMenuOpen]);

  // Check if user profile is incomplete or Strava is not connected
  useEffect(() => {
    if (user && !hasCheckedProfile && location.pathname !== '/lactate-guide') {
      const isProfileIncomplete = !user.dateOfBirth || !user.height || !user.weight || !user.sport;
      const isStravaNotConnected = !user.strava?.athleteId;
      
      // Check if we've already shown the modal in this session
      const hasShownModal = sessionStorage.getItem('profileModalShown');
      
      if ((isProfileIncomplete || isStravaNotConnected) && !hasShownModal) {
        if (isProfileIncomplete) {
          setShowEditProfileModal(true);
        } else if (isStravaNotConnected) {
          setShowStravaModal(true);
        }
        sessionStorage.setItem('profileModalShown', 'true');
      }
      
      setHasCheckedProfile(true);
    }
  }, [user, hasCheckedProfile, location.pathname]);

  // Allow access to lactate-guide and admin without login - render them directly
  if (location.pathname === '/lactate-guide') {
    return <Outlet />;
  }

  // If user is not logged in, show TestingWithoutLogin
  if (!user) {
    return <TestingWithoutLogin />;
  }

  return (
    <div className="h-screen bg-gray-100 flex overflow-hidden">
      {/* Menu na levé straně */}
      <Menu isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />

      {/* Hlavní obsah včetně header, main content a footer */}
      <div className="flex-1 flex flex-col h-full ml-0 overflow-hidden">
        {/* Header */}
        <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />

        {/* Hlavní obsah s footerem uvnitř na mobilu */}
        <main className="flex-1 px-3 sm:px-3 md:px-4 pt-16 md:pt-0 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto flex flex-col min-h-full">
            <div className="flex-1">
            <Outlet /> {/* Zde se renderuje obsah vnořených rout */}
            </div>
            {/* Footer na mobilu - na konci obsahu */}
            <div className="md:hidden">
              <Footer />
            </div>
          </div>
        </main>

        {/* Footer na desktopu - sticky */}
        <div className="hidden md:block">
        <Footer />
        </div>
      </div>
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Edit Profile Modal for users with incomplete profile */}
      {user && (
        <EditProfileModal
          isOpen={showEditProfileModal}
          onClose={() => {
            setShowEditProfileModal(false);
            // After closing edit profile, check if Strava is not connected
            if (!user.strava?.athleteId) {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', formData);
              if (response.data) {
                // Dispatch user update event to update global state
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                // Close edit profile modal and show Strava modal if not connected
                setShowEditProfileModal(false);
                if (!response.data.strava?.athleteId) {
                  setShowStravaModal(true);
                }
                addNotification('Profile updated successfully', 'success');
              }
            } catch (error) {
              console.error('Error updating profile:', error);
              addNotification('Error updating profile', 'error');
            }
          }}
          userData={user}
        />
      )}

      {/* Strava Connect Modal for users without Strava connection */}
      {user && (
        <StravaConnectModal
          isOpen={showStravaModal}
          onClose={() => setShowStravaModal(false)}
          onSuccess={() => {
            setShowStravaModal(false);
            addNotification('Strava connected successfully', 'success');
          }}
        />
      )}
    </div>
  );
};

export default Layout;
