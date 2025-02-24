export const mockTrainings = [
  {
    _id: "training3",
    athleteId: "user2",
    coachId: "user2",
    sport: "run",
    type: "interval",
    title: "10x1km LT2",
    description: "Intervalový běžecký trénink na hranici LT2.",
    date: "2025-11-20",
    duration: "90 min",
    intensity: "LT2",
    results: [
      { interval: 1, duration: "1km", rest: "01:00", intensity: "LT2", power: 210, heartRate: 170, lactate: 3.2, RPE: 7 },
      { interval: 4,duration: "1km", rest: "01:00", intensity: "LT2", power: 215, heartRate: 170, lactate: 2.5, RPE: 9 },
      { interval: 6,duration: "1km", rest: "01:00", intensity: "LT2", power: 210, heartRate: 170, lactate: 2.9, RPE: 12 },
      { interval: 10,duration: "1km", rest: "01:00", intensity: "LT2", power: 200, heartRate: 190, lactate: 3.9, RPE: 17 },
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
    date: "2025-11-15",
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
    title: "4x15min LT2",
    date: "2025-02-29",
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
    "trainingId": "training_3x20min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-01-19",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 354.6,
        "heartRate": 157.0,
        "lactate": 2.9,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 351.3,
        "heartRate": 162.4,
        "lactate": 2.7,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 345.2,
        "heartRate": 156.4,
        "lactate": 2.1,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-01-03",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 348.1,
        "heartRate": 158.2,
        "lactate": 2.5,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 347.8,
        "heartRate": 160.8,
        "lactate": 2.7,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 346.3,
        "heartRate": 156.1,
        "lactate": 2.7,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-01-28",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 346.6,
        "heartRate": 162.6,
        "lactate": 2.4,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 351.7,
        "heartRate": 157.7,
        "lactate": 2.7,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 351.1,
        "heartRate": 162.6,
        "lactate": 2.3,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-02-28",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 351.9,
        "heartRate": 164.4,
        "lactate": 3.0,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 348.8,
        "heartRate": 155.1,
        "lactate": 2.5,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 347.7,
        "heartRate": 159.7,
        "lactate": 2.5,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-02-17",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 349.8,
        "heartRate": 155.5,
        "lactate": 2.3,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 348.8,
        "heartRate": 159.8,
        "lactate": 2.1,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 351.5,
        "heartRate": 165.0,
        "lactate": 2.1,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-02-18",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 353.5,
        "heartRate": 158.9,
        "lactate": 2.3,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 353.5,
        "heartRate": 157.5,
        "lactate": 2.8,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 350.1,
        "heartRate": 159.8,
        "lactate": 2.3,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-03-28",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 348.7,
        "heartRate": 155.5,
        "lactate": 2.8,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 350.1,
        "heartRate": 157.0,
        "lactate": 2.6,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 349.6,
        "heartRate": 161.5,
        "lactate": 2.6,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-03-01",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 352.8,
        "heartRate": 160.8,
        "lactate": 2.9,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 349.9,
        "heartRate": 160.4,
        "lactate": 2.3,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 351.1,
        "heartRate": 161.6,
        "lactate": 2.8,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x20min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x20min LT2",
    "date": "2025-03-11",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "20:00",
        "power": 349.7,
        "heartRate": 164.8,
        "lactate": 2.8,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "20:00",
        "power": 351.8,
        "heartRate": 164.2,
        "lactate": 2.3,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "20:00",
        "power": 351.3,
        "heartRate": 162.1,
        "lactate": 2.8,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-01-15",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 289.4,
        "heartRate": 138.8,
        "lactate": 2.1,
        "RPE": 5
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 272.0,
        "heartRate": 135.1,
        "lactate": 1.4,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 278.8,
        "heartRate": 135.6,
        "lactate": 1.5,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-01-28",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 278.5,
        "heartRate": 140.6,
        "lactate": 2.2,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 272.6,
        "heartRate": 138.9,
        "lactate": 2.2,
        "RPE": 5
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 274.4,
        "heartRate": 141.3,
        "lactate": 2.0,
        "RPE": 5
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-01-05",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 277.2,
        "heartRate": 140.4,
        "lactate": 1.7,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 279.1,
        "heartRate": 135.1,
        "lactate": 1.5,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 278.6,
        "heartRate": 137.1,
        "lactate": 1.6,
        "RPE": 5
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-02-19",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 278.6,
        "heartRate": 143.8,
        "lactate": 2.1,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 288.8,
        "heartRate": 135.0,
        "lactate": 1.8,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 275.6,
        "heartRate": 142.1,
        "lactate": 2.2,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-02-07",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 284.2,
        "heartRate": 141.2,
        "lactate": 1.4,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 276.5,
        "heartRate": 141.2,
        "lactate": 1.5,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 286.8,
        "heartRate": 135.4,
        "lactate": 1.5,
        "RPE": 5
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-02-09",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 271.3,
        "heartRate": 138.4,
        "lactate": 2.1,
        "RPE": 6
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 281.7,
        "heartRate": 144.2,
        "lactate": 1.9,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 289.0,
        "heartRate": 145.0,
        "lactate": 1.6,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-03-08",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 286.9,
        "heartRate": 138.4,
        "lactate": 2.2,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 285.3,
        "heartRate": 137.7,
        "lactate": 2.2,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 283.8,
        "heartRate": 135.1,
        "lactate": 1.8,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-03-11",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 275.1,
        "heartRate": 135.4,
        "lactate": 2.1,
        "RPE": 5
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 283.8,
        "heartRate": 139.7,
        "lactate": 1.9,
        "RPE": 5
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 271.4,
        "heartRate": 135.2,
        "lactate": 1.6,
        "RPE": 5
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_3x30min_LT1_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "3x30min LT1",
    "date": "2025-03-28",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "30:00",
        "power": 281.9,
        "heartRate": 142.6,
        "lactate": 2.1,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "30:00",
        "power": 274.4,
        "heartRate": 141.0,
        "lactate": 2.1,
        "RPE": 6
      },
      {
        "interval": 3,
        "duration": "30:00",
        "power": 277.6,
        "heartRate": 143.3,
        "lactate": 1.5,
        "RPE": 6
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-01-18",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 367.6,
        "heartRate": 162.0,
        "lactate": 2.3,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 371.1,
        "heartRate": 161.3,
        "lactate": 2.5,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 371.5,
        "heartRate": 167.4,
        "lactate": 3.1,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 368.5,
        "heartRate": 168.3,
        "lactate": 2.9,
        "RPE": 7
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 369.9,
        "heartRate": 168.9,
        "lactate": 2.6,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 366.1,
        "heartRate": 168.5,
        "lactate": 2.3,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-01-26",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 368.8,
        "heartRate": 167.9,
        "lactate": 2.1,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 368.5,
        "heartRate": 165.8,
        "lactate": 2.3,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 372.5,
        "heartRate": 163.5,
        "lactate": 2.9,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 369.3,
        "heartRate": 162.6,
        "lactate": 2.5,
        "RPE": 8
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 370.9,
        "heartRate": 166.7,
        "lactate": 2.2,
        "RPE": 8
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 365.9,
        "heartRate": 168.6,
        "lactate": 2.4,
        "RPE": 7
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-01-05",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 371.5,
        "heartRate": 164.9,
        "lactate": 2.5,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 367.7,
        "heartRate": 166.0,
        "lactate": 2.5,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 370.8,
        "heartRate": 160.6,
        "lactate": 2.6,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 370.9,
        "heartRate": 169.2,
        "lactate": 3.0,
        "RPE": 7
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 369.9,
        "heartRate": 167.4,
        "lactate": 2.4,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 366.5,
        "heartRate": 162.6,
        "lactate": 3.0,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-02-25",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 369.9,
        "heartRate": 168.7,
        "lactate": 2.9,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 365.5,
        "heartRate": 167.0,
        "lactate": 2.5,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 374.9,
        "heartRate": 164.0,
        "lactate": 3.1,
        "RPE": 7
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 365.2,
        "heartRate": 161.2,
        "lactate": 2.2,
        "RPE": 8
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 366.3,
        "heartRate": 167.5,
        "lactate": 2.2,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 373.8,
        "heartRate": 168.7,
        "lactate": 3.1,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-02-28",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 367.2,
        "heartRate": 163.2,
        "lactate": 2.9,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 372.5,
        "heartRate": 163.3,
        "lactate": 2.9,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 372.9,
        "heartRate": 166.9,
        "lactate": 2.7,
        "RPE": 7
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 372.0,
        "heartRate": 163.8,
        "lactate": 2.2,
        "RPE": 7
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 370.3,
        "heartRate": 164.4,
        "lactate": 2.8,
        "RPE": 8
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 374.9,
        "heartRate": 168.8,
        "lactate": 2.4,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-02-07",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 368.3,
        "heartRate": 167.9,
        "lactate": 2.8,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 374.5,
        "heartRate": 168.3,
        "lactate": 2.7,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 370.7,
        "heartRate": 166.1,
        "lactate": 2.7,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 372.5,
        "heartRate": 162.7,
        "lactate": 3.1,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 369.3,
        "heartRate": 160.9,
        "lactate": 3.0,
        "RPE": 8
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 373.7,
        "heartRate": 169.8,
        "lactate": 3.0,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-03-17",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 372.1,
        "heartRate": 161.6,
        "lactate": 3.1,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 368.5,
        "heartRate": 164.6,
        "lactate": 2.8,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 369.5,
        "heartRate": 163.9,
        "lactate": 2.7,
        "RPE": 7
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 365.0,
        "heartRate": 165.3,
        "lactate": 2.5,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 369.8,
        "heartRate": 166.9,
        "lactate": 2.6,
        "RPE": 7
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 371.0,
        "heartRate": 168.3,
        "lactate": 2.1,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-03-16",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 373.1,
        "heartRate": 160.6,
        "lactate": 2.6,
        "RPE": 7
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 368.3,
        "heartRate": 166.1,
        "lactate": 2.6,
        "RPE": 7
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 368.1,
        "heartRate": 166.2,
        "lactate": 2.6,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 371.7,
        "heartRate": 168.6,
        "lactate": 3.0,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 369.0,
        "heartRate": 168.4,
        "lactate": 2.4,
        "RPE": 7
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 368.8,
        "heartRate": 163.7,
        "lactate": 2.2,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x10min_LT2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x10min LT2",
    "date": "2025-03-07",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "10:00",
        "power": 372.2,
        "heartRate": 160.4,
        "lactate": 2.9,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "10:00",
        "power": 369.9,
        "heartRate": 160.9,
        "lactate": 2.8,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "10:00",
        "power": 373.6,
        "heartRate": 167.2,
        "lactate": 2.5,
        "RPE": 7
      },
      {
        "interval": 4,
        "duration": "10:00",
        "power": 366.9,
        "heartRate": 163.5,
        "lactate": 2.4,
        "RPE": 7
      },
      {
        "interval": 5,
        "duration": "10:00",
        "power": 372.7,
        "heartRate": 162.7,
        "lactate": 2.8,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "10:00",
        "power": 368.2,
        "heartRate": 165.3,
        "lactate": 2.3,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-01-28",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 391.8,
        "heartRate": 173.4,
        "lactate": 3.4,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 399.3,
        "heartRate": 170.9,
        "lactate": 3.1,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 392.5,
        "heartRate": 177.5,
        "lactate": 3.5,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 397.5,
        "heartRate": 174.6,
        "lactate": 3.0,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 404.6,
        "heartRate": 172.6,
        "lactate": 2.8,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 394.5,
        "heartRate": 172.7,
        "lactate": 3.3,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-01-22",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 408.0,
        "heartRate": 171.8,
        "lactate": 3.0,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 397.8,
        "heartRate": 175.7,
        "lactate": 3.6,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 391.3,
        "heartRate": 177.3,
        "lactate": 3.7,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 402.2,
        "heartRate": 172.9,
        "lactate": 3.6,
        "RPE": 10
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 394.2,
        "heartRate": 171.5,
        "lactate": 3.4,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 404.9,
        "heartRate": 172.3,
        "lactate": 3.1,
        "RPE": 10
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-01-19",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 407.9,
        "heartRate": 179.2,
        "lactate": 3.4,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 409.6,
        "heartRate": 179.3,
        "lactate": 3.2,
        "RPE": 10
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 394.1,
        "heartRate": 173.7,
        "lactate": 3.3,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 397.4,
        "heartRate": 175.1,
        "lactate": 3.5,
        "RPE": 8
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 408.7,
        "heartRate": 177.3,
        "lactate": 3.4,
        "RPE": 10
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 402.4,
        "heartRate": 177.4,
        "lactate": 3.5,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-02-19",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 397.5,
        "heartRate": 173.6,
        "lactate": 3.0,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 392.2,
        "heartRate": 171.7,
        "lactate": 3.4,
        "RPE": 10
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 406.5,
        "heartRate": 174.8,
        "lactate": 2.7,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 405.4,
        "heartRate": 170.5,
        "lactate": 3.1,
        "RPE": 8
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 390.1,
        "heartRate": 170.2,
        "lactate": 3.0,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 407.5,
        "heartRate": 172.0,
        "lactate": 3.3,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-02-05",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 397.4,
        "heartRate": 176.2,
        "lactate": 2.9,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 397.9,
        "heartRate": 176.7,
        "lactate": 3.2,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 405.1,
        "heartRate": 171.8,
        "lactate": 3.6,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 406.5,
        "heartRate": 174.3,
        "lactate": 3.0,
        "RPE": 10
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 409.7,
        "heartRate": 172.0,
        "lactate": 3.2,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 408.0,
        "heartRate": 177.9,
        "lactate": 3.4,
        "RPE": 10
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-02-16",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 403.0,
        "heartRate": 175.1,
        "lactate": 3.2,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 398.7,
        "heartRate": 172.1,
        "lactate": 2.9,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 406.4,
        "heartRate": 174.4,
        "lactate": 3.2,
        "RPE": 10
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 407.0,
        "heartRate": 176.2,
        "lactate": 3.0,
        "RPE": 8
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 394.3,
        "heartRate": 171.0,
        "lactate": 3.1,
        "RPE": 8
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 393.6,
        "heartRate": 172.7,
        "lactate": 3.7,
        "RPE": 10
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-03-22",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 407.1,
        "heartRate": 171.7,
        "lactate": 3.2,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 408.9,
        "heartRate": 173.7,
        "lactate": 3.0,
        "RPE": 10
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 394.8,
        "heartRate": 176.1,
        "lactate": 2.9,
        "RPE": 8
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 405.0,
        "heartRate": 173.3,
        "lactate": 3.0,
        "RPE": 10
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 391.7,
        "heartRate": 170.2,
        "lactate": 3.4,
        "RPE": 10
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 395.7,
        "heartRate": 170.7,
        "lactate": 3.2,
        "RPE": 10
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-03-19",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 402.0,
        "heartRate": 179.8,
        "lactate": 3.5,
        "RPE": 8
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 392.9,
        "heartRate": 174.7,
        "lactate": 3.2,
        "RPE": 8
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 408.1,
        "heartRate": 172.9,
        "lactate": 3.7,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 399.5,
        "heartRate": 177.7,
        "lactate": 3.0,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 398.7,
        "heartRate": 171.7,
        "lactate": 3.4,
        "RPE": 8
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 409.2,
        "heartRate": 174.3,
        "lactate": 3.5,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x5min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x5min Vo2",
    "date": "2025-03-28",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "5:00",
        "power": 407.1,
        "heartRate": 175.0,
        "lactate": 3.6,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "5:00",
        "power": 405.4,
        "heartRate": 178.9,
        "lactate": 3.2,
        "RPE": 10
      },
      {
        "interval": 3,
        "duration": "5:00",
        "power": 394.6,
        "heartRate": 171.4,
        "lactate": 3.4,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "5:00",
        "power": 409.6,
        "heartRate": 172.6,
        "lactate": 3.6,
        "RPE": 10
      },
      {
        "interval": 5,
        "duration": "5:00",
        "power": 408.4,
        "heartRate": 176.6,
        "lactate": 3.2,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "5:00",
        "power": 392.3,
        "heartRate": 176.2,
        "lactate": 3.0,
        "RPE": 8
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-01-12",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 455.0,
        "heartRate": 179.3,
        "lactate": 4.5,
        "RPE": 11
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 454.1,
        "heartRate": 176.0,
        "lactate": 3.9,
        "RPE": 10
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 460.0,
        "heartRate": 183.6,
        "lactate": 4.4,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 455.7,
        "heartRate": 179.7,
        "lactate": 4.2,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 450.2,
        "heartRate": 181.2,
        "lactate": 3.9,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 435.4,
        "heartRate": 183.3,
        "lactate": 3.9,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-01-03",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 444.3,
        "heartRate": 175.7,
        "lactate": 4.3,
        "RPE": 9
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 446.9,
        "heartRate": 175.3,
        "lactate": 3.6,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 450.8,
        "heartRate": 177.5,
        "lactate": 3.6,
        "RPE": 10
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 441.2,
        "heartRate": 179.2,
        "lactate": 3.8,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 462.0,
        "heartRate": 182.0,
        "lactate": 4.2,
        "RPE": 11
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 443.0,
        "heartRate": 178.6,
        "lactate": 4.2,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_1",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-01-23",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 450.3,
        "heartRate": 175.8,
        "lactate": 4.4,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 456.0,
        "heartRate": 181.8,
        "lactate": 3.9,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 464.4,
        "heartRate": 183.9,
        "lactate": 4.1,
        "RPE": 11
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 440.8,
        "heartRate": 184.2,
        "lactate": 4.4,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 450.4,
        "heartRate": 181.8,
        "lactate": 4.3,
        "RPE": 10
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 455.7,
        "heartRate": 181.0,
        "lactate": 3.9,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-02-28",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 440.5,
        "heartRate": 178.7,
        "lactate": 3.5,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 438.1,
        "heartRate": 178.8,
        "lactate": 4.5,
        "RPE": 11
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 458.1,
        "heartRate": 179.1,
        "lactate": 3.6,
        "RPE": 9
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 460.7,
        "heartRate": 182.9,
        "lactate": 4.4,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 452.8,
        "heartRate": 183.6,
        "lactate": 4.2,
        "RPE": 11
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 455.0,
        "heartRate": 181.0,
        "lactate": 3.6,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-02-19",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 439.1,
        "heartRate": 176.2,
        "lactate": 4.5,
        "RPE": 11
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 459.6,
        "heartRate": 182.0,
        "lactate": 3.8,
        "RPE": 11
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 457.1,
        "heartRate": 177.5,
        "lactate": 4.1,
        "RPE": 11
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 451.4,
        "heartRate": 183.0,
        "lactate": 3.9,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 453.5,
        "heartRate": 183.5,
        "lactate": 4.2,
        "RPE": 9
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 458.2,
        "heartRate": 179.5,
        "lactate": 4.2,
        "RPE": 11
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_2",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-02-04",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 462.1,
        "heartRate": 179.4,
        "lactate": 4.5,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 449.5,
        "heartRate": 175.2,
        "lactate": 4.0,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 452.1,
        "heartRate": 182.3,
        "lactate": 3.9,
        "RPE": 11
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 443.3,
        "heartRate": 181.6,
        "lactate": 4.5,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 441.3,
        "heartRate": 177.1,
        "lactate": 3.9,
        "RPE": 11
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 437.5,
        "heartRate": 176.6,
        "lactate": 4.0,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-03-02",
    "scenario": "Špatný den - únava, pokles výkonu",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 452.3,
        "heartRate": 177.1,
        "lactate": 4.5,
        "RPE": 10
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 447.7,
        "heartRate": 183.5,
        "lactate": 3.6,
        "RPE": 11
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 442.4,
        "heartRate": 180.7,
        "lactate": 3.7,
        "RPE": 10
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 446.4,
        "heartRate": 175.6,
        "lactate": 3.9,
        "RPE": 10
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 459.8,
        "heartRate": 182.7,
        "lactate": 4.1,
        "RPE": 11
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 457.9,
        "heartRate": 183.9,
        "lactate": 4.5,
        "RPE": 11
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-03-11",
    "scenario": "Průměrný den - stabilní výkon",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 464.6,
        "heartRate": 175.4,
        "lactate": 3.9,
        "RPE": 11
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 443.2,
        "heartRate": 177.0,
        "lactate": 3.8,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 436.8,
        "heartRate": 183.9,
        "lactate": 3.8,
        "RPE": 11
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 443.9,
        "heartRate": 179.1,
        "lactate": 4.1,
        "RPE": 9
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 435.3,
        "heartRate": 182.3,
        "lactate": 4.4,
        "RPE": 11
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 446.4,
        "heartRate": 184.3,
        "lactate": 3.7,
        "RPE": 11
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    "trainingId": "training_6x1min_Vo2_3",
    "athleteId": "user2",
    "sport": "bike",
    "title": "6x1min Vo2",
    "date": "2025-03-12",
    "scenario": "Skvělý den - výborný výkon, dobré pocity",
    "results": [
      {
        "interval": 1,
        "duration": "1:00",
        "power": 447.6,
        "heartRate": 183.2,
        "lactate": 4.1,
        "RPE": 11
      },
      {
        "interval": 2,
        "duration": "1:00",
        "power": 453.0,
        "heartRate": 178.5,
        "lactate": 4.5,
        "RPE": 9
      },
      {
        "interval": 3,
        "duration": "1:00",
        "power": 446.4,
        "heartRate": 175.3,
        "lactate": 3.9,
        "RPE": 11
      },
      {
        "interval": 4,
        "duration": "1:00",
        "power": 443.1,
        "heartRate": 178.2,
        "lactate": 4.2,
        "RPE": 11
      },
      {
        "interval": 5,
        "duration": "1:00",
        "power": 435.3,
        "heartRate": 176.6,
        "lactate": 3.8,
        "RPE": 10
      },
      {
        "interval": 6,
        "duration": "1:00",
        "power": 442.3,
        "heartRate": 182.4,
        "lactate": 3.8,
        "RPE": 9
      }
    ],
    "specifics": {
      "specific": "Smart trainer",
      "weather": "Indoor"
    },
    "comments": "Analýza výkonu doporučena, sledování únavy a regenerace."
  },
  {
    trainingId: "training21",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2",
    date: "2025-04-29",
    scenario: "Špatný den - únava, pokles výkonu",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.5, RPE: 7 },
      { interval: 2, duration: "15:00", power: 365, heartRate: 168, lactate: 2.1, RPE: 8 },
      { interval: 3, duration: "15:00", power: 380, heartRate: 172, lactate: 3.2, RPE: 9 },
      { interval: 4, duration: "15:00", power: 375, heartRate: 175, lactate: 2.6, RPE: 10 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Únava, možná nutnost regenerace. Doporučení: odpočinek a sledování formy."
  },
  {
    trainingId: "training69",
    athleteId: "user2",
    sport: "bike",
    title: "4x15min LT2",
    date: "2025-06-29",
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
    title: "4x15min LT2",
    date: "2025-07-29",
    scenario: "Průměrný výkon - konzistentní, ale žádná extra síla",
    results: [
      { interval: 1, duration: "15:00", power: 360, heartRate: 165, lactate: 2.4, RPE: 7 },
      { interval: 2, duration: "15:00", power: 360, heartRate: 166, lactate: 2.5, RPE: 7 },
      { interval: 3, duration: "15:00", power: 365, heartRate: 168, lactate: 2.6, RPE: 8 },
      { interval: 4, duration: "15:00", power: 360, heartRate: 170, lactate: 2.8, RPE: 8 },
    ],
    specifics: { specific: "Smart trainer", weather: "Indoor" },
    comments: "Stabilní výkon, ale bez rezervy na zvýšení."
  },
  {
    trainingId: "training61",
    athleteId: "user2",
    title: "4x15min LT2",
    sport: "bike",
    date: "2025-08-29",
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
    title: "4x15min LT2",
    date: "2025-10-29",
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
    title: "4x15min LT2",
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