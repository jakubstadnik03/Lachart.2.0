import * as React from "react";

export default function Footer() {
  return (
    <div className="flex overflow-hidden flex-wrap gap-10 justify-between items-center self-center px-6 py-5 mt-3.5 w-full text-sm leading-none bg-white  border-gray-200 max-md:px-5 max-md:max-w-full">
      <div className="self-stretch my-auto text-gray-600">
        © 2024 La Chart. All Rights Reserved.
      </div>
      <div className="self-stretch my-auto text-right text-blue-500">
        Made by <span className="text-blue-500">La Chart</span>
      </div>
    </div>
  );
}