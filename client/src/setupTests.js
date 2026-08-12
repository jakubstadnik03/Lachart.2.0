// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
//
// Optional: it is CRA scaffolding and has never been listed in package.json, so
// requiring it unconditionally makes `npm test` fail before a single test runs —
// including the suites that only assert on plain values. Load it when it's
// installed, skip it when it isn't.
try {
  // eslint-disable-next-line global-require
  require('@testing-library/jest-dom');
} catch {
  // Tests that need DOM matchers will fail on their own, with a clearer message
  // than a module-not-found in the setup file.
}
