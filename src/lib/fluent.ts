'use client';

/**
 * THE FLUENT SURFACE
 * ==================================================================
 * Fluent UI React v9 is the component system this application is built from.
 * The WinUI layer does not replace it — it rewrites it. `withWinuiAppearance`
 * stamps Fluent's own components with the `data-winui-appearance` axis the CSS
 * selects on, `withWinuiMotion` re-times the dialogs, menus and drawers,
 * `withWinuiToaster` restyles the toast stack, and `withWinuiDrag` gives Switch
 * its WinUI drag gesture.
 *
 * Every screen imports its components from this one module and nowhere else.
 * That gives the whole application a single seam: the day the layer changes,
 * one file changes with it.
 */

import * as Fluent from '@fluentui/react-components';

import { withWinuiAppearance } from '@/winui/appearance';
import { withWinuiDrag } from '@/winui/switch-drag';
import { withWinuiToaster } from '@/winui/toaster';
import { withWinuiMotion } from '@/winui/presence';

/** Fluent, decorated by the WinUI layer, in the order the layer expects. */
export const winui = withWinuiDrag(
  withWinuiToaster(withWinuiMotion(withWinuiAppearance(Fluent))),
);

/* Providers and themes -------------------------------------------------- */
export const { FluentProvider } = winui;

/* Typography ------------------------------------------------------------ */
export const {
  Text,
  Title1,
  Title2,
  Title3,
  Subtitle1,
  Subtitle2,
  Subtitle2Stronger,
  Body1,
  Body1Strong,
  Body2,
  Caption1,
  Caption1Strong,
  Caption2,
} = winui;

/* Surfaces -------------------------------------------------------------- */
export const { Card, CardHeader, Divider } = winui;

/* Actions --------------------------------------------------------------- */
export const { Button, MenuButton, Toolbar, ToolbarButton, ToolbarDivider, Link } = winui;

/* Menus ----------------------------------------------------------------- */
export const { Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, MenuDivider } = winui;

/* Data ------------------------------------------------------------------ */
export const {
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableCell,
  TableBody,
  TableCellLayout,
} = winui;

/* Status ---------------------------------------------------------------- */
export const {
  Badge,
  Tag,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
} = winui;

/* Form controls --------------------------------------------------------- */
export const {
  Input,
  Textarea,
  Field,
  Select,
  Combobox,
  Option,
  Checkbox,
  RadioGroup,
  Radio,
  Switch,
} = winui;

/* People ----------------------------------------------------------------- */
export const { Persona } = winui;

/* Search ---------------------------------------------------------------- */
export const { SearchBox } = winui;

/* Overlays -------------------------------------------------------------- */
export const {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverSurface,
} = winui;

/* Feedback -------------------------------------------------------------- */
export const { ProgressBar, Spinner, Avatar } = winui;

/* Navigation ------------------------------------------------------------ */
export const { TabList, Tab } = winui;

/* Toasts ---------------------------------------------------------------- */
export const { Toaster, useToastController, useId, Toast, ToastTitle, ToastBody } = winui;

/* Themes ---------------------------------------------------------------- */
export { winuiDarkTheme, winuiLightTheme } from '@/winui/theme';
export { severityMark, type SeverityIntent } from '@/winui/appearance';
