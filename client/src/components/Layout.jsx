import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header/Header";
import Menu from "./Menu";

const Layout = () => {
    const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

  return (
 <>
        <div className="flex min-h-screen ">
        <div style={{width: "17rem"}}>
            <Menu loggedInUserId={loggedInUserId} isActive={true}/>
            </div>
          <div className="w-full">
              <Header />
              <div className="content">
             <Outlet />
           </div>
          </div>
         
        </div>
        
 </>
  );
};

export default Layout;
