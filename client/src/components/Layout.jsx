import React from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet } from "react-router-dom";
import Header from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";

const Layout = ({ isMenuOpen, setIsMenuOpen }) => {
  const { user } = useAuth();

  // Pokud není uživatel přihlášen, nezobrazujeme Layout
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Menu na levé straně */}
      <Menu isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />

      {/* Hlavní obsah včetně header, main content a footer */}
      <div className="flex-1 flex flex-col min-h-screen ml-0 ">
        {/* Header */}
        <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />

        {/* Hlavní obsah */}
        <main className="flex-1 px-4">
          <div className="max-w-[1600px] mx-auto">
            <Outlet /> {/* Zde se renderuje obsah vnořených rout */}
          </div>
        </main>

        {/* Footer */}
        <Footer />
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
