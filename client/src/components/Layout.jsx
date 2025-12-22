import React, { useEffect } from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";
import TestingWithoutLogin from "../pages/TestingWithoutLogin";

const Layout = ({ isMenuOpen, setIsMenuOpen }) => {
  const { user } = useAuth();
  const location = useLocation();

  // Ensure menu is open when component mounts
  useEffect(() => {
    if (user) {
      setIsMenuOpen(true);
    }
  }, [user, setIsMenuOpen]);

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
        <main className="flex-1 px-3 sm:px-3 md:px-4 overflow-y-auto">
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
    </div>
  );
};

export default Layout;
