import { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function I({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  floor: (p?: IconProps) => (
    <I {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </I>
  ),
  tickets: (p?: IconProps) => (
    <I {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </I>
  ),
  kitchen: (p?: IconProps) => (
    <I {...p}>
      <path d="M4 20h16M6 20V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11" />
      <path d="M9 7V4M12 7V3M15 7V5" />
    </I>
  ),
  menu: (p?: IconProps) => (
    <I {...p}>
      <path d="M4 6h16M4 12h10M4 18h16" />
    </I>
  ),
  tables: (p?: IconProps) => (
    <I {...p}>
      <rect x="3" y="8" width="18" height="10" rx="2" />
      <path d="M8 8V6M16 8V6M12 18v2" />
    </I>
  ),
  reports: (p?: IconProps) => (
    <I {...p}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3-4 3 2 5-7" />
    </I>
  ),
  staff: (p?: IconProps) => (
    <I {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </I>
  ),
  settings: (p?: IconProps) => (
    <I {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" />
    </I>
  ),
};
