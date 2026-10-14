/**
 * Colour scheme
 * ==================================================================
 * Which scheme the window is in: light or dark.
 *
 * The reason this is a module of its own rather than a `useState` inside a
 * provider is that **three separate things have to agree**, and they do not all
 * live in React:
 *
 *   1. the `--winui-*` dictionaries in `src/winui/tokens.ts` — plain CSS
 *   2. the Fluent theme object handed to `FluentProvider` — JavaScript
 *   3. the segmented control in the navigation rail — React
 *
 * They are tied together by one attribute on `<html>`. The CSS dictionaries are
 * written against `:root[data-ncas-scheme='dark']`, so the moment the attribute
 * changes, every WinUI token flips. The Fluent theme is chosen from the same
 * value in `providers.tsx`, so it flips too. Nothing reads
 * `prefers-color-scheme` any more, which is the point: that query is what made
 * a manual switch impossible, because it cannot be set from JavaScript.
 *
 * The scheme is written by `schemeBootScript` below, which runs in `<head>`
 * before the first paint — otherwise a user who has chosen dark would see a
 * white flash on every navigation. React is told through `subscribe()`, so the
 * control and the provider stay in step without a second copy of the value.
 *
 * A choice is remembered, and until one is made the operating system's
 * preference is followed — which is how WinUI's `RequestedTheme="Default"`
 * behaves, and is why there is no "system" option in the control: it is the
 * starting state, not a third state to sit in.
 */

export type Scheme = 'light' | 'dark';

export const SCHEME_STORAGE_KEY = 'ncas.scheme';
export const SCHEME_ATTRIBUTE = 'data-ncas-scheme';

const listeners = new Set<(scheme: Scheme) => void>();

/** The one line that decides the scheme before anything is painted. */
export const schemeBootScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  SCHEME_STORAGE_KEY,
)});if(s!=='light'&&s!=='dark'){s=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute(${JSON.stringify(
  SCHEME_ATTRIBUTE,
)},s)}catch(e){}})();`;

/** What the operating system is currently set to. */
export function systemScheme(): Scheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The teacher's own choice, if they have made one. */
export function storedScheme(): Scheme | null {
  try {
    const value = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The scheme in force right now: the teacher's choice, or the system's. */
export function currentScheme(): Scheme {
  return storedScheme() ?? systemScheme();
}

/** Write the attribute the CSS dictionaries read. Safe to call repeatedly. */
export function applyScheme(scheme: Scheme): void {
  document.documentElement.setAttribute(SCHEME_ATTRIBUTE, scheme);
}

/** The teacher picked one. Remember it, apply it, and tell React. */
export function chooseScheme(scheme: Scheme): void {
  try {
    window.localStorage.setItem(SCHEME_STORAGE_KEY, scheme);
  } catch {
    /* a browser with storage disabled still gets the scheme for this session */
  }
  applyScheme(scheme);
  for (const listener of listeners) listener(scheme);
}

/** Watch for changes. Returns the function that stops watching. */
export function subscribe(listener: (scheme: Scheme) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
