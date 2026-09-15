/**
 * Whether an athlete already has a place their sessions come from.
 *
 * Every "connect Strava" prompt used to ask only about Strava, so an athlete
 * whose Garmin has synced every ride for a year kept being told to connect
 * Strava — on the dashboard, in the onboarding modal, on the calendar, in
 * the app. Strava is one source, not the only one.
 */
export function stravaLinked(user) {
  return !!(user?.strava?.athleteId || user?.strava?.accessToken);
}

export function garminLinked(user) {
  return !!(user?.garmin?.athleteId || user?.garmin?.accessToken || user?.garmin?.connected);
}

export function hasSyncSource(user) {
  return stravaLinked(user) || garminLinked(user);
}
