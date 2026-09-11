/**
 * A coach on an athlete's profile is asked for that athlete's zones —
 * once per session, only when there are none, never for themselves.
 */
import {
  maybePromptAthleteZonesSetup, OPEN_TRAINING_ZONES_MODAL_EVENT, dismissAthleteZonesPromptForSession,
} from './trainingZonesSetup';

const COACH = { _id: 'c1', role: 'coach' };
const ATHLETE = { _id: 'a1', role: 'athlete', name: 'Vojtěch', surname: 'Jarolím', powerZones: {}, heartRateZones: {} };

let events = [];
window.addEventListener(OPEN_TRAINING_ZONES_MODAL_EVENT, (e) => events.push(e.detail));
beforeEach(() => {
  events = [];
  sessionStorage.clear();
});

test('asks a coach for the zones of an athlete who has none, with the profile attached', () => {
  expect(maybePromptAthleteZonesSetup(COACH, ATHLETE)).toBe(true);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ athleteId: 'a1', source: 'athlete-profile' });
  expect(events[0].profile.name).toBe('Vojtěch');
});

test('asks once per session per athlete', () => {
  maybePromptAthleteZonesSetup(COACH, ATHLETE);
  maybePromptAthleteZonesSetup(COACH, ATHLETE);
  expect(events).toHaveLength(1);
  maybePromptAthleteZonesSetup(COACH, { ...ATHLETE, _id: 'a2' });
  expect(events).toHaveLength(2);
});

test('does not ask when the athlete already has zones', () => {
  expect(maybePromptAthleteZonesSetup(COACH, { ...ATHLETE, powerZones: { cycling: { lt2: 280 } } })).toBe(false);
  expect(events).toHaveLength(0);
});

test('does not ask an athlete about themselves, nor a non-coach about anyone', () => {
  expect(maybePromptAthleteZonesSetup({ _id: 'a1', role: 'athlete' }, ATHLETE)).toBe(false);
  expect(maybePromptAthleteZonesSetup({ _id: 'x', role: 'athlete' }, ATHLETE)).toBe(false);
  expect(events).toHaveLength(0);
});

test('a dismissal holds for the session', () => {
  dismissAthleteZonesPromptForSession('a1');
  expect(maybePromptAthleteZonesSetup(COACH, ATHLETE)).toBe(false);
});
