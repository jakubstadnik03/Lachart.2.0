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
      specifics: {
        cycling: { type: "indoor", bike: "Road bike" },
      },
      weather: { temperature: 20, conditions: "cloudy" },
    },
  ];
  