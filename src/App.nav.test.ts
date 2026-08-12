import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The bottom bar and the route table are two hand-written lists in one file,
 * and nothing but agreement between them keeps a tab working. A tab pointing at
 * a path with no route does not look broken — the catch-all quietly redirects
 * it — so it lands on the start page with the wrong tab lit, and the kid who
 * tapped „Hilfe" concludes the app ignored them.
 *
 * Reading the source rather than rendering it, in the style of the help deep
 * link check: this repo has no component tests, and the thing worth asserting
 * here is a fact about the file, not about a DOM.
 */
describe('nav and routes', () => {
  const source = readFileSync(join(import.meta.dirname, 'App.tsx'), 'utf8');

  const nav = source.slice(
    source.indexOf('<nav className="nav">'),
    source.indexOf('</nav>'),
  );
  const navPaths = [...nav.matchAll(/\sto="([^"]+)"/g)].map((m) => m[1]);
  const routePaths = [...source.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

  it('finds the bar it is meant to be checking', () => {
    expect(nav).not.toBe('');
    expect(navPaths.length).toBeGreaterThan(0);
  });

  // Four is a layout decision — they share the width evenly — not something to
  // drift into. Changing it here is fine; doing it by accident is not.
  it('has exactly four tabs', () => {
    expect(navPaths).toHaveLength(4);
  });

  it('routes every tab it offers', () => {
    for (const path of navPaths) {
      expect(routePaths, `no route for the "${path}" tab`).toContain(path);
    }
  });

  it('opens on the start page', () => {
    expect(navPaths[0]).toBe('/');
    expect(routePaths).toContain('/');
  });

  // Without `end`, "/" matches every path and the start tab stays lit
  // everywhere — two tabs looking active at once.
  it('marks the start tab as an exact match', () => {
    expect(nav).toMatch(/<NavLink\s+to="\/"\s+end>/);
  });
});
