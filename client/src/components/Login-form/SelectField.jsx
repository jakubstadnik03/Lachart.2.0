import React from "react";

const SelectField = ({ label, placeholder }) => {
  return (
    <div className="flex flex-col flex-1 shrink basis-0 min-w-[240px] mb-2.5">
      <label className="gap-2 self-start font-semibold text-gray-900 whitespace-nowrap">
        {label}
      </label>
      <div className="flex flex-col justify-center py-3 pr-3 pl-4 mt-2 w-full text-gray-600 bg-white rounded-lg border border-gray-300 border-solid">
        <div className="flex items-center w-full">
          <select
            className="flex-1 shrink gap-3 self-stretch my-auto appearance-none bg-transparent"
            aria-label={label}
          >
            <option value="">{placeholder}</option>
          </select>
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/TEMP/8a8199c1ca0b07813714e7cb52e97dbd8e046b005199d52da8adc066730861b0?placeholderIfAbsent=true&apiKey=f26ef201ae1f4d94a4c50b4406b07044"
            className="object-contain shrink-0 self-stretch my-auto w-6 aspect-square"
            alt=""
          />
        </div>
      </div>
    </div>
  );
};

export default SelectField;