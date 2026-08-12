import { http } from '../api/http';
import { DAILY_LESSONS, type DailyLesson } from './lessons';

export type CardSession = {
  id: string;
  title: string;
  sport: string;
  sportLabel: string;
  detail: string | null;
  tss?: number;
  rpe?: number | null;
  hard?: boolean;
  isLactateTest?: boolean;
};

export type DailyCard = {
  dateKey: string;
  styleId: string;
  styleLabel: string;
  greeting: string;
  headline: string;
  directive: string;
  readiness: {
    state: 'veryFresh' | 'fresh' | 'neutral' | 'productive' | 'strained';
    label: string;
    fact: string;
    color: string;
    fitness: number;
    fatigue: number;
    form: number;
    gauge: number;
    readout: string;
  };
  load: { last7: number; prev7: number; sessions7: number; changePct: number | null };
  todayPlanned: CardSession[];
  todayCompleted: CardSession[];
  tomorrowPlanned: CardSession[];
  yesterday: CardSession | null;
  lessonIndex: number;
  showLesson: boolean;
  pushBody: string;
};

/**
 * The server sends a lesson *index* rather than the lesson text — the bodies are
 * long, they never change between requests, and shipping them with the app keeps
 * the card readable when the phone is offline mid-session.
 */
export function lessonFor(card: DailyCard | null): DailyLesson | null {
  if (!card || !card.showLesson) return null;
  return DAILY_LESSONS[card.lessonIndex % DAILY_LESSONS.length] ?? null;
}

export async function fetchDailyCard(athleteId?: string): Promise<DailyCard> {
  const { data } = await http.get<DailyCard>('/api/daily-card', {
    params: {
      athleteId,
      // Day boundaries have to land where the athlete is, not where the server is.
      tzOffset: new Date().getTimezoneOffset(),
    },
  });
  return data;
}
