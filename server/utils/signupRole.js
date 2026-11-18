'use strict';

/**
 * Roles a person may pick for themselves when signing up (SignUpPage offers
 * Athlete, Coach and Tester / Lab). 'testing' is the internal QA role that can
 * read every test in the database (testController.getTests / getTestById), so
 * only an admin may grant it — never the sign-up request body.
 */
const SELF_SIGNUP_ROLES = ['athlete', 'coach', 'tester'];

function normalizeSignupRole(role) {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return SELF_SIGNUP_ROLES.includes(r) ? r : 'athlete';
}

module.exports = { normalizeSignupRole, SELF_SIGNUP_ROLES };
