import React, { useState } from "react";
import { SearchInput } from "./SearchInput";
import { UserDropdown } from "./UserDropdown";
import { getMockUser } from "../../mock/mockApi";

export function Header() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const user = getMockUser();

  return (
    <div className="flex flex-col w-full">
      <div className="flex relative justify-end z-[1] items-center py-4 px-6 w-full border-b border-solid bg-zinc-50 border-b-stone-300">
        <div className="flex-1 flex gap-4 items-center">
          <SearchInput />
        </div>
        <div className="flex items-center gap-4">
          <UserDropdown 
            user={user}
            isOpen={isDropdownOpen}
            setIsOpen={setIsDropdownOpen}
          />
        </div>
      </div>
    </div>
  );
}