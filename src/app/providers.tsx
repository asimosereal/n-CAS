'use client';

import React from 'react';

import { AppProvider } from '@/lib/store/store';
import { FluentProvider, winuiDarkTheme, winuiLightTheme } from '@/lib/fluent';
import {
  applyScheme,
  currentScheme,
  storedScheme,
  subscribe,
} from '@/lib/scheme';
import type { Scheme } from '@/lib/scheme';

/**
 * Providers
 * ------------------------------------------------------------------
 * Hands the window its Fluent theme.
 *
 * The theme object and the CSS have to agree, and they agree by reading one
 * value rather than by each guessing. `src/lib/scheme.ts` owns that value: the
 * `--winui-*` dictionaries in `src/winui/tokens.ts` are written against
 * `:root[data-ncas-scheme='dark']`, so the attribute alone decides what every
 * WinUI token is. The Fluent theme is chosen from the same value here, for the
 * tokens the WinUI palette does not cover.
 *
 * Neither side reads `prefers-color-scheme` any more. That query was what made
 * a manual switch impossible, because it describes the operating system and
 * cannot be set from JavaScript — the scheme had to be inferred from it on both
 * sides at once, and a teacher's choice had nowhere to live.
 *
 * ---------------------------------------------------------------------------
 * Why the root class is on a wrapper and not on FluentProvider
 * ---------------------------------------------------------------------------
 * Fluent hands the root provider's `className` down to the provider it mounts
 * inside the portal root, so that dialogs, menus, popovers and combobox lists
 * inherit the same theme style tag:
 *
 *   themeClassName: applyStylesToPortals ? root.className : themeClassName
 *   @fluentui/react-provider/lib/components/FluentProvider/useFluentProviderContextValues.js
 *
 * Anything layout-shaped in that class is therefore also applied to an element
 * Fluent positions over the entire window. `.ncas-root` carried `height: 100%`,
 * which stretched that portal provider to the full viewport — and because Fluent
 * paints every provider with `background-color: var(--colorNeutralBackground1)`,
 * the result was an opaque sheet over the whole application the moment a
 * combobox list opened. The height now lives here, on the root provider's own
 * inline style, which is not passed down; only the class is.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Starts on light because the server has no way to know otherwise. The real
  // scheme is already on the document element — the boot script in
  // src/app/layout.tsx put it there before the first paint — so this state
  // catches up on the first effect rather than deciding anything. Keeping the
  // initial render identical on both sides also avoids a hydration mismatch.
  const [scheme, setScheme] = React.useState<Scheme>('light');

  React.useEffect(() => {
    const apply = () => {
      const next = currentScheme();
      // Re-asserted rather than assumed: if the operating system has changed
      // while the tab was in the background, the attribute is the thing the CSS
      // reads, so it has to be brought up to date as well as the state.
      applyScheme(next);
      setScheme(next);
    };

    apply();

    /* A change in the operating system's preference is followed only while the
       teacher has not chosen a scheme of their own — after that, their choice
       stands until they change it, which is what "remembered" has to mean. */
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (!storedScheme()) apply();
    };
    query.addEventListener('change', onSystemChange);

    const unsubscribe = subscribe(setScheme);
    return () => {
      query.removeEventListener('change', onSystemChange);
      unsubscribe();
    };
  }, []);

  return (
    <FluentProvider
      theme={scheme === 'dark' ? winuiDarkTheme : winuiLightTheme}
      style={{ height: '100%' }}
    >
      <div className="ncas-root">
        <AppProvider>{children}</AppProvider>
      </div>
    </FluentProvider>
  );
}
