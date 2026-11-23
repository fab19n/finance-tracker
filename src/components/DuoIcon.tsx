import type { ReactNode } from "react";

/**
 * Dual-tone icons: a soft filled shape (the `duo-fill` class, the icon's own colour at low opacity) under a plain
 * outline. They take the same props as a lucide icon (`size`, `strokeWidth`, `aria-hidden`), so they drop in where
 * one was. The colour comes from `currentColor`, so they follow the theme and the active-tab colour; `var()` is not
 * used in SVG attributes (it renders black), the tint lives in a CSS class in globals.css.
 *
 * Every shape sits on a 24 px grid. Add a name here and to `DuoName` to add an icon.
 */
const SHAPES = {
  home: (
    <>
      <path className="duo-fill" d="M5 10.5 12 4.5l7 6V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M3.5 11 12 3.8 20.5 11M5.5 9.7V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.7M10 20v-5h4v5" />
    </>
  ),
  activity: (
    <>
      <rect className="duo-fill" x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 9h7M8.5 12h7M8.5 15h4M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    </>
  ),
  accounts: (
    <>
      <rect className="duo-fill" x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M3 10h18M6.5 15h3M6 5.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z" />
    </>
  ),
  more: (
    <>
      <rect className="duo-fill" x="4" y="4" width="7" height="7" rx="2" />
      <rect className="duo-fill" x="13" y="13" width="7" height="7" rx="2" />
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  plan: (
    <>
      <rect className="duo-fill" x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10.5h16M9 15l2 2 4-4M7 5.5h10a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8.5a3 3 0 0 1 3-3z" />
    </>
  ),
  shared: (
    <>
      <circle className="duo-fill" cx="9" cy="8.5" r="3.5" />
      <path d="M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 19.5c.4-3 2.6-4.8 6-4.8s5.6 1.8 6 4.8M16 5.3a3.3 3.3 0 0 1 0 6.4M18 15.2c1.7.6 2.8 2 3 4.3" />
    </>
  ),
  insights: (
    <>
      <path className="duo-fill" d="M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z" />
      <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5zM9.8 20h4.4M10.5 17v3M13.5 17v3" />
    </>
  ),
  invest: (
    <>
      <path className="duo-fill" d="M3.5 18.5 9 12l3.5 3.5L20 7v11.5z" />
      <path d="M3.5 17 9 11.5l3.5 3.5L20.5 7M15 7h5.5v5.5" />
    </>
  ),
  import: (
    <>
      <path className="duo-fill" d="M4 15h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  settings: (
    <>
      <circle className="duo-fill" cx="9" cy="8" r="2.6" />
      <circle className="duo-fill" cx="15" cy="16" r="2.6" />
      <path d="M4 8h2.4M11.6 8H20M4 16h8.4M17.6 16H20" />
      <circle cx="9" cy="8" r="2.6" />
      <circle cx="15" cy="16" r="2.6" />
    </>
  ),
  bank: (
    <>
      <path className="duo-fill" d="M4 9.5 12 4l8 5.5V19H4z" />
      <path d="M3.5 9.5 12 4l8.5 5.5M5.5 9.5V19M18.5 19V9.5M9 12.5v4.5M15 12.5v4.5M3.5 19.5h17" />
    </>
  ),
  cash: (
    <>
      <rect className="duo-fill" x="3" y="6.5" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M5.5 6.5h13A2.5 2.5 0 0 1 21 9v6a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15V9a2.5 2.5 0 0 1 2.5-2.5zM6.5 12h.01M17.5 12h.01" />
    </>
  ),
  ewallet: (
    <>
      <rect className="duo-fill" x="3.5" y="6.5" width="17" height="12.5" rx="3" />
      <path d="M6.5 6.5 16 4.2a1.2 1.2 0 0 1 1.5 1.2V6.5M6.5 6.5h11A3 3 0 0 1 20.5 9.5v7a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3zM20.5 11.5h-3.8a2 2 0 0 0 0 4h3.8" />
    </>
  ),
  cart: (
    <>
      <path className="duo-fill" d="M6.2 8h13.6l-1.6 5.4a1.5 1.5 0 0 1-1.5 1.1H8.7a1.5 1.5 0 0 1-1.5-1.1z" />
      <path d="M3 4h2.2l2 9.4a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.5-1.1L19.8 8H6.2" />
      <circle cx="9.5" cy="19" r="1.2" />
      <circle cx="17" cy="19" r="1.2" />
    </>
  ),
  utensils: (
    <>
      <path className="duo-fill" d="M16 3c-2 1.5-3 4-3 7v3h3z" />
      <path d="M6 3v6a2 2 0 0 0 4 0V3M8 11v10M16 21V3c-2 1.5-3 4-3 7v3h3" />
    </>
  ),
  car: (
    <>
      <path className="duo-fill" d="M4 12.5h16V17a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 17v-4.5l1.7-4.6A2 2 0 0 1 7.6 6.5h8.8a2 2 0 0 1 1.9 1.4L20 12.5V17a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12.5h16M7.5 15h.01M16.5 15h.01" />
    </>
  ),
  bolt: (
    <>
      <path className="duo-fill" d="M13 3 5.5 13.5H11L10 21l8.5-11H13z" />
      <path d="M13 3 5.5 13.5H11L10 21l8.5-11H13z" />
    </>
  ),
  bag: (
    <>
      <path className="duo-fill" d="M5.5 8h13l1 11.2a1.5 1.5 0 0 1-1.5 1.6H6a1.5 1.5 0 0 1-1.5-1.6z" />
      <path d="M5.5 8h13l1 11.2a1.5 1.5 0 0 1-1.5 1.6H6a1.5 1.5 0 0 1-1.5-1.6zM9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  heart: (
    <>
      <path className="duo-fill" d="M12 20s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
      <path d="M12 20s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
    </>
  ),
  film: (
    <>
      <rect className="duo-fill" x="4" y="5" width="16" height="14" rx="3" />
      <path d="M7 5h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4" />
    </>
  ),
  plane: (
    <>
      <path className="duo-fill" d="M21 4 3 11l6.5 2.5z" />
      <path d="M21 4 3 11l6.5 2.5L12 20l2.5-5.5zM9.5 13.5 21 4" />
    </>
  ),
  gift: (
    <>
      <rect className="duo-fill" x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-2.5-4.5-3-4.5-.8 0 1.2 1.5 1.8 4.5.8zM12 7c1-2.5 4.5-3 4.5-.8 0 1.2-1.5 1.8-4.5.8z" />
    </>
  ),
  book: (
    <>
      <path className="duo-fill" d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13.5H6.5A1.5 1.5 0 0 0 5 19z" />
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13.5H6.5A1.5 1.5 0 0 0 5 19zM5 19a1.5 1.5 0 0 0 1.5 1.5H19v-3" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type DuoName = keyof typeof SHAPES;

export function DuoIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  ...rest
}: {
  name: DuoName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {SHAPES[name]}
    </svg>
  );
}
