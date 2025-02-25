import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";
import { useAuth } from '../context/AuthProvider';

const Layout = ({ children }) => {
  const { currentUser } = useAuth();

  return (
    <div className="flex min-h-screen overflow-hidden">
      <div>
        <Menu />
      </div>
      <div className="w-full flex flex-col full-desctop">
        <Header />
        <main className="content flex-grow">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
