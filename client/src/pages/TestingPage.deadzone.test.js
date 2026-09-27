import fs from 'fs';
import path from 'path';

/**
 * A source-level guard, because the failure it catches is invisible to every
 * other kind of test.
 *
 * TestingPage hands native builds to NativeTestingPage with an early return
 * partway down the component, and declares several bindings BELOW that return —
 * `const setActiveTab = setMobileTab` among them. Anything above the return that
 * touches one of those reads it in its temporal dead zone on native, and React
 * surfaces that as "Cannot access 'X' before initialization" in the error
 * boundary, with a minified name and no useful stack.
 *
 * It shipped: the effect that reads ?sport= called setActiveTab, and ?sport= is
 * produced by exactly one thing — the "your LT2 has moved" notification. So the
 * single screen that deep link exists to open was the single screen that could
 * not be opened, in the app, while every browser test passed because the web
 * path never takes the early return.
 *
 * Rendering the native branch under jsdom would need Capacitor stubbed and the
 * whole page's data layer mocked. Reading the source costs nothing and fails
 * loudly the moment someone adds another late `const` and reaches for it above.
 */
/**
 * Comments are stripped first, and that is not incidental: the first version of
 * this guard passed while the bug was present, because the comment explaining
 * the bug contained the words `const setActiveTab = setMobileTab` and the check
 * read its own prose as a declaration.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SRC = stripComments(fs.readFileSync(path.join(__dirname, 'TestingPage.jsx'), 'utf8'));

const NATIVE_RETURN = /if \(isCapacitorNative\(\) && !searchParams\.get\('full'\)\) \{/;

describe('TestingPage native early return', () => {
  const idx = SRC.search(NATIVE_RETURN);

  it('still has the early return this guard is about', () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it('declares nothing above the return that is only bound below it', () => {
    const above = SRC.slice(0, idx);
    const below = SRC.slice(idx);

    // Bindings introduced after the return: reachable on web, never on native.
    const lateBindings = [...below.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)]
      .map((m) => m[1]);

    const offenders = [...new Set(lateBindings)].filter((name) => {
      // Ignore names that are also declared above — those are separate scopes.
      if (new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(above)) return false;
      if (new RegExp(`\\[\\s*[\\w$]+\\s*,\\s*${name}\\s*\\]`).test(above)) return false;
      return new RegExp(`\\b${name}\\s*\\(`).test(above);
    });

    expect(offenders).toEqual([]);
  });
});
