import React from 'react';

import { NavRail } from '@/components/NavRail';

/**
 * Desktop layout
 * ------------------------------------------------------------------
 * The window chrome shared by screens 2, 3 and 4: a navigation rail and the
 * main column. The reader station deliberately sits outside this group — it is
 * a kiosk standing in a corridor, not a workspace at a desk, so it must not be
 * reachable through navigation that a student could wander into.
 */
export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ncas-window">
      <NavRail />
      <div className="ncas-main">{children}</div>
    </div>
  );
}
