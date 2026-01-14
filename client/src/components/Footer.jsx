import * as React from "react";

export default function Footer() {
  return (
    <div className="flex overflow-hidden flex-wrap gap-4 sm:gap-10 justify-between items-center self-center px-6 py-5 w-full text-sm leading-none bg-white border-t border-gray-200 max-md:px-5 max-md:max-w-full">
      <div className="self-stretch my-auto text-gray-600">
        © 2026 La Chart. All Rights Reserved.
      </div>
      <div className="flex items-center gap-4 sm:gap-6">
        <a
          href="https://buymeacoffee.com/lachart"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors"
          title="Support LaChart development"
        >
          <span className="text-base">☕</span>
          <span className="text-xs sm:text-sm font-medium">Buy me a coffee</span>
        </a>
        <div className="self-stretch my-auto text-right text-blue-500">
          Made by <span className="text-blue-500">La Chart</span>
        </div>
      </div>
    </div>
  );
}