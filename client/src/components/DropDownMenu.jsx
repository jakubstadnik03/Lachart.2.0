import React, { useState, useRef, useEffect } from "react";

export function DropdownMenu({ 
  selectedValue,
  options = [],
  onChange,
  displayKey = "label",
  valueKey = "value"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  // Přidána kontrola existence options
  const selectedOption = options && options.length > 0 
    ? options.find(opt => opt[valueKey] === selectedValue)
    : null;

  // Přidáme useEffect pro zachycení kliknutí mimo menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Hlavní tlačítko */}
      <div
        className="flex gap-3.5 items-center px-4 py-2 bg-zinc-100 rounded-[91px] cursor-pointer"
        role="button"
        aria-label="Training selector"
        onClick={toggleMenu}
      >
        {/* Hamburger menu ikona */}
        <svg className="w-5 h-5 mr-1 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <div className="text-xs sm:text-sm">
          {selectedOption ? selectedOption[displayKey] : 'Select training'}
        </div>
        <img
          loading="lazy"
          src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/360c5357e47d27ba69f8c2d3bda65bfea9c145ed9c2ccb0e3ef65b920f754610?apiKey=069fe6e63e3c490cb6056c51644919ef&"
          className={`object-contain shrink-0 self-stretch w-2.5 aspect-[2] transform ${
            isOpen ? "rotate-180" : "rotate-0"
          } transition-transform ml-1`}
          alt="Dropdown arrow"
        />
      </div>

      {/* Dropdown menu */}
      {isOpen && options && options.length > 0 && (
        <ul className="absolute left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-full">
          {options.map((option, index) => (
            <li
              key={option[valueKey] || index}
              onClick={() => {
                onChange(option[valueKey]);
                setIsOpen(false);
              }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              {option[displayKey]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
