import React from "react";

const TextArea = ({ label, placeholder }) => {
  return (
    <div className="flex flex-col mt-2.5 w-full min-h-[145px] max-md:max-w-full">
      <label className="gap-2 self-start font-semibold text-gray-900 whitespace-nowrap">
        {label}
      </label>
      <textarea
        placeholder={placeholder}
        className="flex-1 py-3 pr-3 pl-4 mt-2 w-full text-gray-600 bg-white rounded-lg border border-gray-300 border-solid max-md:max-w-full"
        aria-label={label}
      />
    </div>
  );
};

export default TextArea;