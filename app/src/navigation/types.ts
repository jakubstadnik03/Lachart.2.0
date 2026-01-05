export type TrainingSourceType = 'strava' | 'fit' | 'regular';

export type RootStackParamList = {
  MainDrawer: undefined;
  TrainingDetail: {
    sourceType: TrainingSourceType;
    id: string;
    title?: string;
    dateISO?: string;
    sport?: string;
    category?: string | null;
  };
};



