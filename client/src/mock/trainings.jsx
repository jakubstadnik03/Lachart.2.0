export const mockTrainings = [
  {
    _id: "training1",
    athleteId: "user2",
    coachId: "user1",
    sport: "cycling",
    type: "interval",
    title: "4x15min LT2",
    description: "Intervalový trénink na trenažeru.",
    date: "2024-11-29",
    duration: "60 min",
    intensity: "LT2",
    intervals: [
      { duration: "15:00", rest: "02:00", intensity: "LT2", power: 360, heartRate: 165, lactate: 2.4, RPE: 7 },
      { duration: "15:00", rest: "02:00", intensity: "LT2", power: 370, heartRate: 168, lactate: 2.8, RPE: 8 },
    ],
    specifics: { cycling: { type: "indoor", bike: "Road bike" } },
    weather: { temperature: 20, conditions: "cloudy" },
  },
  {
    _id: "training2",
    athleteId: "user2",
    coachId: "user1",
    sport: "cycling",
    type: "endurance",
    title: "3x20min Sweet Spot",
    description: "Vytrvalostní trénink s úseky na sweet spot intenzitě.",
    date: "2024-11-25",
    duration: "90 min",
    intensity: "Sweet Spot",
    intervals: [
      { duration: "20:00", rest: "05:00", intensity: "Sweet Spot", power: 370, heartRate: 160, lactate: 2.2, RPE: 6 },
      { duration: "20:00", rest: "05:00", intensity: "Sweet Spot", power: 360, heartRate: 158, lactate: 2.1, RPE: 6 },
    ],
    specifics: { cycling: { type: "outdoor", bike: "Gravel bike" } },
    weather: { temperature: 15, conditions: "sunny" },
  },
  {
    _id: "training3",
    athleteId: "user3",
    coachId: "user1",
    sport: "running",
    type: "interval",
    title: "10x1km LT2",
    description: "Intervalový běžecký trénink na hranici LT2.",
    date: "2024-11-20",
    duration: "90 min",
    intensity: "LT2",
    intervals: [
      { duration: "1km", rest: "01:00", intensity: "LT2", pace: "4:30", heartRate: 170, lactate: 2.5, RPE: 7 },
    ],
    specifics: { running: { terrain: "track", shoes: "Nike Vaporfly" } },
    weather: { temperature: 12, conditions: "windy" },
  },
  {
    _id: "training4",
    athleteId: "user4",
    coachId: "user2",
    sport: "cycling",
    type: "tempo",
    title: "5x10min Tempo",
    description: "Trénink na tempo zóně.",
    date: "2024-11-15",
    duration: "75 min",
    intensity: "Tempo",
    intervals: [
      { duration: "10:00", rest: "03:00", intensity: "Tempo", power: 310, heartRate: 150, lactate: 1.8, RPE: 5 },
    ],
    specifics: { cycling: { type: "indoor", bike: "Smart trainer" } },
    weather: { temperature: 18, conditions: "clear" },
  },
  {
    _id: "training5",
    athleteId: "user2",
    coachId: "user1",
    sport: "cycling",
    type: "endurance",
    title: "3x20min Sweet Spot",
    description: "Další varianta sweet spot tréninku.",
    date: "2024-11-12",
    duration: "90 min",
    intensity: "Sweet Spot",
    intervals: [
      { duration: "20:00", rest: "05:00", intensity: "Sweet Spot", power: 350, heartRate: 155, lactate: 2.0, RPE: 6 },
      { duration: "20:00", rest: "05:00", intensity: "Sweet Spot", power: 360, heartRate: 158, lactate: 2.1, RPE: 6 },
    ],
    specifics: { cycling: { type: "outdoor", bike: "Road bike" } },
    weather: { temperature: 10, conditions: "foggy" },
  },
  {
    _id: "training6",
    athleteId: "user5",
    coachId: "user1",
    sport: "swimming",
    type: "sprint",
    title: "8x50m Sprint",
    description: "Krátké intenzivní plavecké úseky.",
    date: "2024-11-10",
    duration: "60 min",
    intensity: "Sprint",
    intervals: [
      { duration: "50m", rest: "01:30", intensity: "Sprint", pace: "1:10", lactate: 6.0, RPE: 9 },
    ],
    specifics: { swimming: { poolLength: "25m", style: "Freestyle" } },
    weather: null,
  },
  {
    _id: "training7",
    athleteId: "user2",
    coachId: "user1",
    sport: "cycling",
    type: "endurance",
    title: "3x20min Sweet Spot",
    description: "Další z řady vytrvalostních tréninků na sweet spot zóně.",
    date: "2024-11-08",
    duration: "90 min",
    intensity: "Sweet Spot",
    intervals: [
      { duration: "20:00", rest: "05:00", intensity: "Sweet Spot", power: 355, heartRate: 157, lactate: 2.2, RPE: 6 },
    ],
    specifics: { cycling: { type: "indoor", bike: "Smart trainer" } },
    weather: { temperature: 22, conditions: "cloudy" },
  },
  {
    _id: "training8",
    athleteId: "user6",
    coachId: "user1",
    sport: "running",
    type: "long run",
    title: "15km Steady State",
    description: "Dlouhý běh ve stálém tempu.",
    date: "2024-11-05",
    duration: "90 min",
    intensity: "Endurance",
    intervals: [
      { duration: "15km", rest: "-", intensity: "Endurance", pace: "5:00", heartRate: 150, lactate: 1.6, RPE: 5 },
    ],
    specifics: { running: { terrain: "trail", shoes: "Adidas Ultraboost" } },
    weather: { temperature: 14, conditions: "sunny" },
  },
];
