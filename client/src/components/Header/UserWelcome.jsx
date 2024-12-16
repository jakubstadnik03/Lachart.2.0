import * as React from "react";

export function UserWelcome({ name }) {
  return (
    <div className="flex z-0 flex-col self-stretch my-auto mr-auto ml-10 w-[90px]">
      <div className="text-xl font-semibold text-zinc-900">Hi {name},</div>
      <div className="text-xs text-stone-500">Welcome Back!</div>
    </div>
  );
}