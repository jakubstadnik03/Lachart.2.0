"use client";
import * as React from "react";
import { useState } from "react";
import SportButton from "./SportButton";
import AthleteAvatar from "./AthleteAvatar";

export default function SportsSelector() {
  const [selectedSport, setSelectedSport] = useState("cycling");

  const sports = ["Cycling", "Running", "Swimming"];
  
  const athletes = [
    { src: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ad122768cde8374812232997b185ae66aaa23a8e79ac284caef95948ca5ec618?apiKey=069fe6e63e3c490cb6056c51644919ef&", alt: "Athlete 1" },
    { src: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/db540457371908a6bde8dcd628cbe6c0d1d3a4b85fd54d7a7ad8a7e7ffe33c15?apiKey=069fe6e63e3c490cb6056c51644919ef&", alt: "Athlete 2" },
    { src: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/d56c3e4d193856079c668eb02f2001bbdfb06cb7d8fc5ed0d45cc94a1304c498?apiKey=069fe6e63e3c490cb6056c51644919ef&", alt: "Athlete 3" },
    { src: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/c311ce2bdd81387d176db51d173b2a1ef8120d6915266cf45366ff9571ac0f69?apiKey=069fe6e63e3c490cb6056c51644919ef&", alt: "Athlete 4" },
  ];

  function selectSport(sport) {
    setSelectedSport(sport.toLowerCase());
  }

  return (
    <div className="flex flex-wrap justify-between items-center py-4">
      <div className="flex gap-1.5 items-center self-stretch p-1.5 my-auto ml-5 text-xs text-center whitespace-nowrap rounded-md bg-zinc-100 min-w-[240px] text-stone-500 w-[247px]">
        {sports.map((sport) => (
          <SportButton
            key={sport}
            sport={sport}
            isSelected={selectedSport === sport.toLowerCase()}
            onClick={selectSport}
          />
        ))}
      </div>
      <div className="flex gap-5 items-center self-stretch my-auto min-w-[240px]">
        <div className="flex gap-2 items-center self-stretch my-auto mr-5 min-w-[240px]">
          <div className="self-stretch my-auto text-xs text-zinc-900">
            Select athlete
          </div>
          <div className="flex gap-2.5 items-center self-stretch my-auto text-xs font-medium whitespace-nowrap text-stone-500 max-md:hidden">
            {athletes.map((athlete, index) => (
              <AthleteAvatar
                key={index}
                src={athlete.src}
                alt={athlete.alt}
              />
            ))}
            <div
  className="overflow-hidden self-stretch px-2.5 my-auto w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center"
  style={{ backgroundColor: "#EFEFEF" }}
>
  9+
</div>

          </div>
        </div>
      </div>
    </div>
  );
}