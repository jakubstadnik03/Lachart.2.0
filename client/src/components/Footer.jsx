import * as React from "react";
import { Link } from "react-router-dom";
import { isCapacitorNative } from "../utils/isNativeApp";

export default function Footer() {
  // App Store guideline 3.1.1 prohibits external donation links inside iOS
  // apps — donations that grant any digital-content benefit must go through
  // In-App Purchase. We don't run IAP yet, so the donation button is
  // hidden in the native shell. Web users keep the link.
  const isNative = isCapacitorNative();
  return (
    <div className="flex flex-wrap gap-4 sm:gap-10 justify-between items-center px-4 sm:px-6 py-4 w-full text-sm leading-none bg-white border-t border-gray-200">
      <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/images/LaChart.png" alt="LaChart" className="h-7 w-auto object-contain" />
        <span className="font-semibold text-primary">LaChart</span>
      </Link>

      <div className="self-stretch my-auto text-gray-500 text-xs">
        © 2026 LaChart. All Rights Reserved.
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        {!isNative && (
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
        )}
      </div>
    </div>
  );
}
