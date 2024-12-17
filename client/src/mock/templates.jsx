export const mockTemplates = [
  {
    _id: "template1",
    sport: "running",
    title: "10x1km LT2",
    description: "Intervalový trénink na hranici laktátového prahu.",
    duration: "90 min",
    intensity: "LT2",
    intervals: [
      { duration: "1km", rest: "01:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "1km", rest: "01:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
    ],
  },
  {
    _id: "template2",
    sport: "cycling",
    title: "5x10min FTP",
    description: "Trénink na zvýšení FTP s krátkým odpočinkem.",
    duration: "2 hours",
    intensity: "FTP",
    intervals: [
      { duration: "10min", rest: "05:00", intensity: "FTP", targetLactate: 3.5, RPE: 7 },
      { duration: "10min", rest: "05:00", intensity: "FTP", targetLactate: 3.5, RPE: 7 },
      { duration: "10min", rest: "05:00", intensity: "FTP", targetLactate: 3.5, RPE: 7 },
      { duration: "10min", rest: "05:00", intensity: "FTP", targetLactate: 3.5, RPE: 7 },
    ],
  },
  {
    _id: "template3",
    sport: "swimming",
    title: "8x100m Sprint",
    description: "Krátké intenzivní úseky s dostatečným odpočinkem.",
    duration: "60 min",
    intensity: "Anaerobic",
    intervals: [
      { duration: "100m", rest: "02:00", intensity: "Sprint", targetLactate: 6.0, RPE: 9 },
      { duration: "100m", rest: "02:00", intensity: "Sprint", targetLactate: 6.0, RPE: 9 },
    ],
  },
  {
    _id: "template4",
    sport: "cycling",
    title: "3x20min Sweet Spot",
    description: "Dlouhé úseky na sweet spot intenzitě pro zlepšení vytrvalosti.",
    duration: "90 min",
    intensity: "Sweet Spot",
    intervals: [
      { duration: "20min", rest: "10:00", intensity: "Sweet Spot", targetLactate: 2.0, RPE: 6 },
      { duration: "20min", rest: "10:00", intensity: "Sweet Spot", targetLactate: 2.0, RPE: 6 },
    ],
  },
  {
    _id: "template5",
    sport: "running",
    title: "6x400m Repeats",
    description: "Krátké rychlé úseky pro zlepšení rychlosti a VO2 max.",
    duration: "45 min",
    intensity: "VO2 Max",
    intervals: [
      { duration: "400m", rest: "02:00", intensity: "VO2 Max", targetLactate: 5.0, RPE: 8 },
      { duration: "400m", rest: "02:00", intensity: "VO2 Max", targetLactate: 5.0, RPE: 8 },
    ],
  },
  {
    _id: "template6",
    sport: "cycling",
    title: "4x20min LT2 p:2min",
    description: "Dlouhé úseky na laktátovém prahu s krátkým odpočinkem.",
    duration: "100 min",
    intensity: "LT2",
    intervals: [
      { duration: "20min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "20min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "20min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "20min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
    ],
  },
  {
    _id: "template7",
    sport: "cycling",
    title: "6x10min LT2",
    description: "Krátké úseky na laktátovém prahu.",
    duration: "90 min",
    intensity: "LT2",
    intervals: [
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
      { duration: "10min", rest: "02:00", intensity: "LT2", targetLactate: 2.5, RPE: 6 },
    ],
  },
  {
    _id: "template8",
    sport: "swimming",
    title: "3x400m Endurance",
    description: "Dlouhé úseky pro vytrvalost v bazénu.",
    duration: "70 min",
    intensity: "Endurance",
    intervals: [
      { duration: "400m", rest: "03:00", intensity: "Endurance", targetLactate: 2.0, RPE: 5 },
      { duration: "400m", rest: "03:00", intensity: "Endurance", targetLactate: 2.0, RPE: 5 },
    ],
  },
];
