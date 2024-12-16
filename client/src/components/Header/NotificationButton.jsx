import * as React from "react";

export function NotificationButton() {
  return (
    <button className="flex gap-2 items-center p-2.5 rounded-md bg-zinc-100 h-[38px] w-[38px]">
      <img
        loading="lazy"
        src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/012debdc499215f8f6ef66440f7058872e77d8c50daa481ff5b2074c2aeffa28?apiKey=069fe6e63e3c490cb6056c51644919ef&"
        alt=""
        className="object-contain self-stretch my-auto rounded-md aspect-square w-[18px]"
      />
    </button>
  );
}