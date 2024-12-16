import * as React from "react";

export function SearchInput() {
  return (
    <div className="flex gap-2 items-center self-stretch p-2.5 my-auto mr-2.5 rounded-md bg-zinc-100 min-w-[240px]">
      <img
        loading="lazy"
        src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/6c7a562a0ed27a3cef4686aed74aa67292fbca1dd3757e4bb60a891698cdfdb7?apiKey=069fe6e63e3c490cb6056c51644919ef&"
        alt=""
        className="object-contain shrink-0 self-stretch my-auto w-4 aspect-square"
      />
      <label htmlFor="searchInput" className="sr-only">Search</label>
      <input
        type="text"
        id="searchInput"
        className="bg-transparent self-stretch my-auto w-[262px] outline-none"
        placeholder="Search"
      />
    </div>
  );
}