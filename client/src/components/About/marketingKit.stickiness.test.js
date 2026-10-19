import { STYLE } from './marketingKit';

/**
 * The marketing pages pin three things to the viewport: the background
 * gradients (.lc-page::before), the scroll progress bar (.lc-progress) and the
 * mobile menu scrim (.lc-mobile-scrim). All three live inside .lc-page.
 *
 * A transform on .lc-page makes it the containing block for every one of them,
 * and they silently start following a 19,000 px document instead of the
 * viewport. The background pseudo is the expensive one: spread over the whole
 * document it repaints on every scroll frame, which is what made the sticky nav
 * stutter and jump on a phone.
 *
 * That is exactly what happened. The page-entrance animation ended on
 * `transform: none` with fill-mode `both`, and a filled final keyframe of
 * `transform: none` computes to the identity matrix — a transform like any
 * other as far as containing blocks are concerned.
 */

/** The body of an @keyframes block, by name. */
const keyframesBody = (css, name) => {
  const at = css.indexOf(`@keyframes ${name}`);
  if (at === -1) return null;
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
};

describe('the page-entrance animation', () => {
  test('exists and is applied to .lc-page-in', () => {
    expect(keyframesBody(STYLE, 'lc-page-in')).not.toBeNull();
    expect(STYLE).toContain('.lc-page-in { animation: lc-page-in');
  });

  test('animates no transform, not even one that ends at none', () => {
    // `transform: none` in a filled final keyframe is still a transform: it
    // computes to matrix(1,0,0,1,0,0) and establishes a containing block.
    expect(keyframesBody(STYLE, 'lc-page-in')).not.toMatch(/transform/);
  });

  test('still fades, so the entrance is not simply gone', () => {
    expect(keyframesBody(STYLE, 'lc-page-in')).toMatch(/opacity/);
  });
});

describe('what depends on .lc-page not being a containing block', () => {
  test('the background gradients are pinned to the viewport', () => {
    expect(STYLE).toMatch(/\.lc-page::before\s*\{[^}]*position:\s*fixed/);
  });

  test('the scroll progress bar is pinned to the viewport', () => {
    expect(STYLE).toMatch(/\.lc-progress\s*\{[^}]*position:\s*fixed/);
  });
});

describe('the sticky bar on touch devices', () => {
  test('drops the backdrop blur Safari re-rasterises every frame', () => {
    const coarse = STYLE.slice(STYLE.indexOf('@media (pointer: coarse)'));
    expect(coarse).toContain('.lc-stickynav');
    expect(coarse).toMatch(/backdrop-filter:\s*none/);
    expect(coarse).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
