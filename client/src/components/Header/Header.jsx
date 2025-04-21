import React, { useState } from "react";
import { SearchInput } from "./SearchInput";
import { UserDropdown } from "./UserDropdown";
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthProvider';

const Header = ({ isMenuOpen, setIsMenuOpen }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { user } = useAuth();

  const handleMenuToggle = () => {
    if (typeof setIsMenuOpen === 'function') {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  return (
    <div className="flex flex-col w-full sticky top-0 z-[2] bg-zinc-50">
      <div className="flex relative justify-between items-center px-6 w-full border-b border-solid border-b-stone-300 custom-padding">
        {/* Menu Toggle Button */}
        <button
          onClick={handleMenuToggle}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100"
        >
          {isMenuOpen ? (
            <XMarkIcon className="h-6 w-6 text-gray-600" />
          ) : (
            <Bars3Icon className="h-6 w-6 text-gray-600" />
          )}
        </button>

        {/* Search and User Info */}
        <div className="flex-1 flex gap-4 items-center justify-end">
          <div className="hidden md:block flex-1 max-w-xl">
            <SearchInput />
          </div>
          <UserDropdown 
            isOpen={isDropdownOpen}
            setIsOpen={setIsDropdownOpen}
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