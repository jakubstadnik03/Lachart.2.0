import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SearchInput } from "./SearchInput";
import { UserDropdown } from "./UserDropdown";
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthProvider';
import { isCapacitorNative } from '../../utils/isNativeApp';
import NotificationBell from './NotificationBell';
import WhatsNewButton from './WhatsNewButton';
import FeatureGuideButton from './FeatureGuideButton';
import DownloadAppButton from './DownloadAppButton';

const Header = ({ isMenuOpen, setIsMenuOpen, user: propUser }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { user: authUser } = useAuth();

  // A signed-in user wins over a page's placeholder (the free calculators
  // pass an empty one); with neither, this is a visitor.
  const user = authUser || propUser;
  const guest = !user?.role;

  const handleMenuToggle = () => {
    if (typeof setIsMenuOpen === 'function') {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  return (
    <div className="lc-glass-bar safe-top z-50 flex w-full shrink-0 flex-col fixed top-0 lg:sticky">
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
          {/* Search is over the visitor's own trainings, tests and athletes —
              a visitor has none. */}
          {!guest && (
            <div className="hidden lg:block flex-1 max-w-xl">
              <SearchInput />
            </div>
          )}
          {/* "Download iPhone app" — visible to logged-out AND logged-in
              users on web. Hidden inside the Capacitor native build (those
              users obviously already have the app). */}
          {!isCapacitorNative() && <DownloadAppButton />}
          {!guest && <FeatureGuideButton />}
          {!guest && <WhatsNewButton />}
          {!guest && <NotificationBell />}
          {guest ? (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="hidden sm:inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 touch-manipulation"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex min-h-[40px] items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:opacity-90 touch-manipulation"
              >
                Create free account
              </Link>
            </div>
          ) : (
            <UserDropdown
              isOpen={isDropdownOpen}
              setIsOpen={setIsDropdownOpen}
              user={user}
            />
          )}
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