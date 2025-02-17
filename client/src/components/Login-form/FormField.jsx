import React from "react";

const FormField = ({ label, type, placeholder, required }) => {
  return (
    <div className="flex flex-col w-full mb-2.5">
      <label className="gap-2 self-start text-sm font-semibold text-orange-400">
        {label}
        {required && <span className="text-orange-400">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        className="flex flex-col justify-center py-3 pr-3 pl-4 mt-1.5 w-full text-xs text-gray-600 bg-white rounded-lg border border-gray-300 border-solid"
        aria-label={label}
      />
    </div>
  );
};

export default FormField;