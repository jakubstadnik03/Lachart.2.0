import * as React from "react";

export default function AthleteAvatar({ src, alt }) {
  return (
    <img
      loading="lazy"
      src={src}
      alt={alt}
      className="object-contain shrink-0 self-stretch my-auto w-8 aspect-square rounded-[141px]"
    />
  );
}