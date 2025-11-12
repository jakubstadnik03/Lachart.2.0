import * as React from "react";

function NotificationBadge({ isActive, onToggle }) {
  return (
    <div className="w-full sm:w-auto">
      <div className="flex justify-center sm:justify-end">
        <button
          onClick={onToggle}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-primary border-solid w-full sm:w-auto
            ${isActive ? "bg-primary text-white" : "text-stone-500"}`}
          role="status"
          aria-live="polite"
        >
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/1f3e5714fd003d23eeb1cf388e748fcbf9c42f1adb8928e52365015a031e63ad?apiKey=f26ef201ae1f4d94a4c50b4406b07044&"
            className={`object-contain w-5 h-5 sm:w-6 sm:h-6
              ${isActive ? "brightness-0 invert" : ""}`}
            alt=""
            aria-hidden="true"
          />
          <div className="text-sm sm:text-base">
            {isActive ? "Hide testing" : "New testing"}
          </div>
        </button>
      </div>
    </div>
  );
}

export default NotificationBadge;
