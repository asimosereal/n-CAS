'use client';

import React from 'react';

import { AppProvider } from '@/lib/store/store';
import { FluentProvider, winuiDarkTheme, winuiLightTheme } from '@/lib/fluent';

/**
 * Providers
 * ------------------------------------------------------------------
 * The Fluent theme is chosen from `prefers-color-scheme` and from nothing else.
 *
 * That is not a shortcut. The `--winui-*` token dictionaries in
 * `src/winui/tokens.ts` are written as a `prefers-color-scheme: dark` media
 * query on `:root`, so a JavaScript theme switch could flip Fluent's tokens
 * while leaving the WinUI dictionaries on the old scheme. Reading the same
 * query for the Fluent theme is the only way the two stay in step, and it is
 * what the layer's own comments specify.
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
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setDark(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return (
    <FluentProvider
      theme={dark ? winuiDarkTheme : winuiLightTheme}
      style={{ height: '100%' }}
    >
      <div className="ncas-root">
        <AppProvider>{children}</AppProvider>
      </div>
    </FluentProvider>
  );
}
