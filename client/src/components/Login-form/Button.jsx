import React from "react";

const Button = ({ variant, text }) => {
  const baseClasses = "flex overflow-hidden gap-2 justify-center items-center self-stretch px-3.5 py-4 my-auto text-base font-semibold whitespace-nowrap rounded-lg min-h-[48px] w-[156px]";
  const variantClasses = {
    outline: "text-orange-600 border border-orange-600 border-solid",
    primary: "text-white bg-violet-500"
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]}`}>
      {text}
    </button>
  );
};

export default Button;