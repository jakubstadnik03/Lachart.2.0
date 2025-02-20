import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";

const Layout = () => {
    const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

  return (
 <>
        <div className="flex min-h-screen overflow-hidden ">
        <div>
            <Menu loggedInUserId={loggedInUserId} isActive={true}/>
            </div>
          <div className="w-full full-desctop">
              <Header />
              <div className="content">
             <Outlet />
           </div>
           <Footer />

          </div>
        </div>
        
 </>
  );
};

export default Layout;
