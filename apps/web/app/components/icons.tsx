import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Icon>
  );
}

export function ApiIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 4.5 2 8l3.5 3.5" />
      <path d="M10.5 4.5 14 8l-3.5 3.5" />
      <path d="M9 3 7 13" />
    </Icon>
  );
}

export function EnvironmentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 13.5 5v6L8 14 2.5 11V5L8 2Z" />
      <path d="M2.5 5 8 8l5.5-3" />
      <path d="M8 8v6" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2.2 1.3" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2v1.3M8 12.7V14M2 8h1.3M12.7 8H14M3.8 3.8l.9.9M11.3 11.3l.9.9M12.2 3.8l-.9.9M4.7 11.3l-.9.9" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.8v1.2M8 13v1.2M1.8 8H3M13 8h1.2M3.6 3.6l.9.9M11.5 11.5l.9.9M12.4 3.6l-.9.9M4.5 11.5l-.9.9" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 9.7A5.3 5.3 0 0 1 6.3 3a5.3 5.3 0 1 0 6.7 6.7Z" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.8" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 2l12 12" />
      <path d="M6.6 4.1A6.8 6.8 0 0 1 8 3.8c4.1 0 6.5 4.2 6.5 4.2a11.3 11.3 0 0 1-2.1 2.7" />
      <path d="M9.9 11.9A6.4 6.4 0 0 1 8 12.2C3.9 12.2 1.5 8 1.5 8a11.6 11.6 0 0 1 2.9-3.3" />
    </Icon>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="1.8" y="2.5" width="12.4" height="11" rx="2" />
      <path d="M4.5 6.2 6.8 8 4.5 9.8" />
      <path d="M8.2 9.8h3.3" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" />
      <path d="M10 11 13.5 8 10 5" />
      <path d="M13.5 8H6" />
    </Icon>
  );
}
