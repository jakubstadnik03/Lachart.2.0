import React from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet } from "react-router-dom";
import { Header } from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";

const Layout = () => {
  const { user } = useAuth();

  // Pokud není uživatel přihlášen, nezobrazujeme Layout
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Menu na levé straně */}
      <Menu />

      {/* Hlavní obsah včetně header, main content a footer */}
      <div className="flex-1 flex flex-col min-h-screen ml-0 md:ml-64">
        {/* Header */}
        <Header />

        {/* Hlavní obsah */}
        <main className="flex-1 px-4">
          <div className="max-w-[1600px] mx-auto">
            <Outlet /> {/* Zde se renderuje obsah vnořených rout */}
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
