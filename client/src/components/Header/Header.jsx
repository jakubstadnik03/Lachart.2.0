import React, { useState } from "react";
import { SearchInput } from "./SearchInput";
import { UserDropdown } from "./UserDropdown";
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthProvider';
import NotificationBell from './NotificationBell';

const Header = ({ isMenuOpen, setIsMenuOpen, user: propUser }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { user: authUser } = useAuth();

  // Use prop user if provided, otherwise use auth user
  const user = propUser || authUser;

  const handleMenuToggle = () => {
    if (typeof setIsMenuOpen === 'function') {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  return (
    <div className="safe-top z-50 flex w-full shrink-0 flex-col bg-zinc-50 fixed top-0 lg:sticky">
      <div className="flex relative justify-between items-center px-3 sm:px-6 w-full border-b border-solid border-b-stone-300 custom-padding">
        {/* Menu Toggle Button */}
        <button
          onClick={handleMenuToggle}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 lg:hidden active:bg-gray-200 touch-manipulation"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? (
            <XMarkIcon className="h-6 w-6 text-gray-600" />
          ) : (
            <Bars3Icon className="h-6 w-6 text-gray-600" />
          )}
        </button>

        {/* Search and User Info */}
        <div className="flex-1 flex gap-2 sm:gap-4 items-center justify-end">
          <div className="hidden lg:block flex-1 max-w-xl">
            <SearchInput />
          </div>
          <NotificationBell />
          <UserDropdown
            isOpen={isDropdownOpen}
            setIsOpen={setIsDropdownOpen}
            user={user}
            disabled={!user?.role} // Disable dropdown if user has no role (demo mode)
          />
        </div>
      </div>
      
      {/* Mobile Search - zobrazí se pouze na mobilech */}
      {/* <div className="md:hidden p-4 bg-zinc-50 border-b border-stone-300 sticky top-[72px] z-[99]">
        <SearchInput />
      </div> */}
    </div>
  );
};

export default Header;