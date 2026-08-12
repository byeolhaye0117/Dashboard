/**
 * 아이콘
 *
 * 이모지는 기기·브라우저마다 다르게 그려지고, 어떤 것은 두 조각으로 쪼개져 보인다.
 * 그래서 전부 선으로 직접 그렸다. 어디서 보든 똑같이 나온다.
 */

export type IconName =
  | "home" | "users" | "card" | "phone" | "dumbbell"
  | "clock" | "clipboard" | "box" | "badge" | "lock"
  | "sun" | "moon" | "warn" | "check" | "chevron" | "fold" | "unfold" | "grid" | "plus" | "menu"
  | "tag" | "chat";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3.2 10.4 12 3.4l8.8 7v9.1a1 1 0 0 1-1 1h-4.6v-6.1H8.8v6.1H4.2a1 1 0 0 1-1-1z" />,
  users: (
    <>
      <circle cx="9.6" cy="8" r="3.2" />
      <path d="M3.6 20v-1.4A3.4 3.4 0 0 1 7 15.2h5.2a3.4 3.4 0 0 1 3.4 3.4V20" />
      <path d="M16.8 5.4a3 3 0 0 1 0 5.6M20.4 20v-1.3a3.3 3.3 0 0 0-2.4-3.1" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.6" width="18" height="12.8" rx="2.2" />
      <path d="M3 10.2h18M6.8 14.6h4" />
    </>
  ),
  phone: (
    <path d="M6.6 3.9h2.9l1.4 3.5-2 1.4a12.2 12.2 0 0 0 5.3 5.3l1.4-2 3.5 1.4v2.9a1.6 1.6 0 0 1-1.7 1.6C10.5 17.5 6.5 13.5 5 5.6a1.6 1.6 0 0 1 1.6-1.7z" />
  ),
  dumbbell: <path d="M4 9.2v5.6M7.2 7.4v9.2M16.8 7.4v9.2M20 9.2v5.6M7.2 12h9.6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3 1.9" />
    </>
  ),
  clipboard: (
    <>
      <rect x="9" y="2.9" width="6" height="3.2" rx="1.1" />
      <path d="M15.6 4.6H17a1.6 1.6 0 0 1 1.6 1.6v13a1.6 1.6 0 0 1-1.6 1.6H7a1.6 1.6 0 0 1-1.6-1.6v-13A1.6 1.6 0 0 1 7 4.6h1.4M9 11.4h6M9 14.8h3.6" />
    </>
  ),
  box: (
    <>
      <path d="M3.6 8 12 4.1 20.4 8v8L12 19.9 3.6 16z" />
      <path d="M3.6 8 12 11.9 20.4 8M12 11.9v8" />
    </>
  ),
  badge: (
    <>
      <rect x="3.8" y="4.2" width="16.4" height="15.6" rx="2.6" />
      <circle cx="12" cy="10.2" r="2.4" />
      <path d="M8.1 16.9c.8-1.7 2.2-2.5 3.9-2.5s3.1.8 3.9 2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.8" y="10.4" width="14.4" height="9.4" rx="2.1" />
      <path d="M8.4 10.4V7.9a3.6 3.6 0 0 1 7.2 0v2.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />,
  warn: (
    <>
      <path d="M12 4.2 21 19.4H3z" />
      <path d="M12 10v3.6M12 16.6v.1" />
    </>
  ),
  check: <path d="m4.5 12.4 5 5 10-11" />,
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  tag: (
    <>
      <path d="M11.6 3.4H4.6a1.2 1.2 0 0 0-1.2 1.2v7l9 9 8.2-8.2-9-9z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.8l1.7-3.5A6.9 6.9 0 0 1 3.5 12.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z" />
      <path d="M8.6 12h.01M12 12h.01M15.4 12h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m8.5 5 7 7-7 7" />,
  fold: (
    <>
      <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.4" />
      <path d="M9.6 4.4v15.2M17 9.4 14.4 12l2.6 2.6" />
    </>
  ),
  unfold: (
    <>
      <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.4" />
      <path d="M9.6 4.4v15.2M14.4 9.4 17 12l-2.6 2.6" />
    </>
  ),
  grid: (
    <>
      <rect x="3.6" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="1.8" />
    </>
  ),
};

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export default function Icon({ name, size = 20, strokeWidth = 1.6, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: `0 0 ${size}px` }}
    >
      {PATHS[name]}
    </svg>
  );
}
