import * as React from "react";

function NotificationBadge() {
  const [isHidden, setIsHidden] = React.useState(false);

  const toggleNotification = () => {
    setIsHidden(!isHidden);
  };

  return (
    <div className="flex flex-col items-center pb-2 w-full text-sm text-stone-500 max-md:max-w-full">
      <div className="flex flex-col justify-center items-center px-16 py-px max-w-full w-[1064px] max-md:px-5">
        <button
          onClick={toggleNotification}
          className={`flex gap-1.5 items-center p-2.5 rounded-md border border-violet-500 border-solid
            ${isHidden ? 'bg-violet-500 text-white' : 'text-stone-500'}`}
          role="status"
          aria-live="polite"
        >
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/1f3e5714fd003d23eeb1cf388e748fcbf9c42f1adb8928e52365015a031e63ad?apiKey=f26ef201ae1f4d94a4c50b4406b07044&"
            className={`object-contain shrink-0 self-stretch my-auto w-6 aspect-square
              ${isHidden ? 'brightness-0 invert' : ''}`}
            alt=""
            aria-hidden="true"
          />
          <div className="self-stretch my-auto w-[104px]">
            {isHidden ? 'Hide testing' : 'New testing'}
          </div>
        </button>
      </div>
    </div>
  );
}

export default NotificationBadge;