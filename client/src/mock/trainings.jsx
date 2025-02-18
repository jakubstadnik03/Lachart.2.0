export const mockTrainings = [
  {
    _id: "training3",
    athleteId: "user2",
    coachId: "user2",
    sport: "run",
    type: "interval",
    title: "10x1km LT2",
    description: "Intervalový běžecký trénink na hranici LT2.",
    date: "2024-11-20",
    duration: "90 min",
    intensity: "LT2",
    results: [
      { interval: 1, duration: "1km", rest: "01:00", intensity: "LT2", power: "3:30", heartRate: 170, lactate: 3.2, RPE: 7 },
      { interval: 4,duration: "1km", rest: "01:00", intensity: "LT2", power: "3:35", heartRate: 170, lactate: 2.5, RPE: 9 },
      { interval: 6,duration: "1km", rest: "01:00", intensity: "LT2", power: "3:30", heartRate: 170, lactate: 2.9, RPE: 12 },
      { interval: 10,duration: "1km", rest: "01:00", intensity: "LT2", power: "3:20", heartRate: 190, lactate: 3.9, RPE: 17 },
    ],
    specifics: { specific: "track", weather: "Nike Vaporfly" },
    comments: "Perfektní den, ukázka skvělé formy. Možnost zvýšit cílový tempo."

  },
  {
    _id: "training4",
    athleteId: "user4",
    coachId: "user2",
    sport: "bike",
    type: "tempo",
    title: "5x10min Tempo",
    description: "Trénink na tempo zóně.",
    date: "2024-11-15",
    duration: "75 min",
    intensity: "Tempo",
    results: [
      { duration: "10:00", rest: "03:00", intensity: "Tempo", power: 310, heartRate: 150, lactate: 1.8, RPE: 5 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
  },
  {
    trainingId: "training4",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2024-02-29",
    scenario: "Perfektní den - progresivní výkon",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.4, RPE: 7 },
      { interval: 2, duration: "15:00", power: 365, heartRate: 167, lactate: 2.6, RPE: 7 },
      { interval: 3, duration: "15:00", power: 365, heartRate: 170, lactate: 2.9, RPE: 8 },
      { interval: 4, duration: "15:00", power: 360, heartRate: 173, lactate: 3.2, RPE: 8 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Perfektní den, ukázka skvělé formy. Možnost zvýšit cílový výkon."
  },
  {
    trainingId: "training21",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2024-04-29",
    scenario: "Špatný den - únava, pokles výkonu",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.5, RPE: 7 },
      { interval: 2, duration: "15:00", power: 365, heartRate: 168, lactate: 2.8, RPE: 8 },
      { interval: 3, duration: "15:00", power: 380, heartRate: 172, lactate: 3.2, RPE: 9 },
      { interval: 4, duration: "15:00", power: 375, heartRate: 175, lactate: 3.6, RPE: 10 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Únava, možná nutnost regenerace. Doporučení: odpočinek a sledování formy."
  },
  {
    trainingId: "training61",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2024-06-29",
    scenario: "Špatný den - únava, pokles výkonu",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.5, RPE: 7 },
      { interval: 2, duration: "15:00", power: 355, heartRate: 168, lactate: 2.8, RPE: 8 },
      { interval: 3, duration: "15:00", power: 350, heartRate: 172, lactate: 3.2, RPE: 9 },
      { interval: 4, duration: "15:00", power: 345, heartRate: 175, lactate: 3.6, RPE: 10 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Únava, možná nutnost regenerace. Doporučení: odpočinek a sledování formy.",

  },
  {
    trainingId: "training17",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2024-07-29",
    scenario: "Průměrný výkon - konzistentní, ale žádná extra síla",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.4, RPE: 7 },
      { interval: 2, duration: "15:00", power: 360, heartRate: 166, lactate: 2.5, RPE: 7 },
      { interval: 3, duration: "15:00", power: 1200, heartRate: 168, lactate: 2.6, RPE: 8 },
      { interval: 4, duration: "15:00", power: 360, heartRate: 170, lactate: 2.8, RPE: 8 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Stabilní výkon, ale bez rezervy na zvýšení."
  },
  {
    trainingId: "training61",
    athleteId: "user2",
    sport: "bike",
    date: "2024-08-29",
    scenario: "Špatný den - únava, pokles výkonu",
    results: [
      { interval: 1, duration: "15:00", power: 380, heartRate: 165, lactate: 2.5, RPE: 7 },
      { interval: 2, duration: "15:00", power: 380, heartRate: 168, lactate: 2.8, RPE: 8 },
      { interval: 3, duration: "15:00", power: 385, heartRate: 172, lactate: 3.2, RPE: 9 },
      { interval: 4, duration: "15:00", power: 385, heartRate: 175, lactate: 3.6, RPE: 10 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Únava, možná nutnost regenerace. Doporučení: odpočinek a sledování formy."
  },
  {
    trainingId: "training40",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2024-10-29",
    scenario: "Extrémní den - překvapivě vysoký výkon",
    results: [
      { interval: 1, duration: "15:00", power: 365, heartRate: 163, lactate: 2.2, RPE: 6 },
      { interval: 2, duration: "15:00", power: 370, heartRate: 165, lactate: 2.4, RPE: 6 },
      { interval: 3, duration: "15:00", power: 380, heartRate: 167, lactate: 2.7, RPE: 7 },
      { interval: 4, duration: "15:00", power: 385, heartRate: 170, lactate: 3.0, RPE: 8 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Den jako z pohádky, možná signál k navýšení tréninkových zón."
  },
  {
    trainingId: "training41",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2 p:2min",
    date: "2025-01-29",
    scenario: "Extrémní den - překvapivě vysoký výkon",
    results: [
      { interval: 1, duration: "15:00", power: 390, heartRate: 163, lactate: 2.2, RPE: 6 },
      { interval: 2, duration: "15:00", power: 400, heartRate: 165, lactate: 2.4, RPE: 6 },
      { interval: 3, duration: "15:00", power: 395, heartRate: 167, lactate: 2.7, RPE: 7 },
      { interval: 4, duration: "15:00", power: 395, heartRate: 170, lactate: 3.0, RPE: 8 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Den jako z pohádky, možná signál k navýšení tréninkových zón."
  }
]