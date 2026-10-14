'use client';

import React from 'react';

import { Button } from '@/lib/fluent';
import { Lightbulb20Regular, WeatherMoon20Regular } from '@fluentui/react-icons';
import { chooseScheme, currentScheme, subscribe } from '@/lib/scheme';
import type { Scheme } from '@/lib/scheme';

/**
 * Scheme switch
 * ==================================================================
 * The light/dark choice, in the lower-left corner of the navigation rail.
 *
 * Two buttons rather than a check box: the question is which of two schemes the
 * window is in, and a check box can only say yes or no to one of them. The
 * selected segment carries the accent fill, which is how WinUI marks the chosen
 * item in a small exclusive set.
 *
 * The control holds no state of its own. `src/lib/scheme.ts` owns the value —
 * written to `<html>` before the first paint and to storage afterwards — and
 * this component subscribes to it, so the switch, the provider and the CSS
 * dictionaries cannot fall out of step. Reading the value once on mount rather
 * than in a `useState` initialiser also keeps the server and the first client
 * render identical.
 *
 * Until the teacher picks one, the operating system's preference is what is
 * shown. That is WinUI's `RequestedTheme="Default"`, and it is why there is no
 * third "system" segment here: it is the starting state, not a place to sit.
 */
export function SchemeSwitch() {
  const [scheme, setScheme] = React.useState<Scheme>('light');

  React.useEffect(() => {
    // The attribute is already set by the boot script, so this is the real
    // scheme on the first effect rather than a guess that then corrects itself.
    setScheme(currentScheme());
    return subscribe(setScheme);
  }, []);

  return (
    <div className="ncas-scheme">
      <span className="ncas-scheme__label" id="ncas-scheme-label">
        Appearance
      </span>
      <div className="ncas-scheme__options" role="group" aria-labelledby="ncas-scheme-label">
        <Button
          size="small"
          appearance={scheme === 'light' ? 'primary' : 'subtle'}
          icon={<Lightbulb20Regular />}
          aria-pressed={scheme === 'light'}
          onClick={() => chooseScheme('light')}
        >
          Light
        </Button>
        <Button
          size="small"
          appearance={scheme === 'dark' ? 'primary' : 'subtle'}
          icon={<WeatherMoon20Regular />}
          aria-pressed={scheme === 'dark'}
          onClick={() => chooseScheme('dark')}
        >
          Dark
        </Button>
      </div>
    </div>
  );
}
