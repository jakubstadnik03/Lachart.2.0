import * as React from "react";
import { SearchInput } from "./SearchInput";
import { NotificationButton } from "./NotificationButton";
import { UserWelcome } from "./UserWelcome";

export function Header() {
  return (
    <div className="flex flex-col pb-3 -mb-px  w-full">
      <div className="flex relative justify-end z-[1] items-center py-4 pr-10 pl-px w-full border-b border-solid bg-zinc-50 border-b-stone-300 max-md:pr-5 max-md:max-w-full">
        <UserWelcome name="Jakub" />
        <div className="flex z-0 gap-2.5 items-center self-stretch my-auto text-xs whitespace-nowrap min-w-[240px] text-stone-500">
          <SearchInput />
        </div>
        <NotificationButton />
      </div>
    </div>
  );
}