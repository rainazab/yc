import clsx from "clsx";

export type AppIconName =
  | "activity"
  | "back"
  | "bell"
  | "calendar"
  | "check"
  | "chat"
  | "growth"
  | "handshake"
  | "inbox"
  | "mail"
  | "money"
  | "overview"
  | "plus"
  | "refund"
  | "rules"
  | "spark"
  | "x";

export function AppIcon({
  name,
  className,
}: {
  name: AppIconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clsx("h-5 w-5", className)}
      {...common}
    >
      {name === "overview" && (
        <>
          <rect x="4" y="4" width="6" height="7" rx="1.5" />
          <rect x="14" y="4" width="6" height="4" rx="1.5" />
          <rect x="14" y="12" width="6" height="8" rx="1.5" />
          <rect x="4" y="15" width="6" height="5" rx="1.5" />
        </>
      )}
      {name === "inbox" && (
        <>
          <path d="M4 6h16v9.5A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5V6Z" />
          <path d="M4 13h4l1.5 2h5L16 13h4" />
        </>
      )}
      {name === "rules" && (
        <>
          <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-2-1.4V6a2 2 0 0 1 2-2Z" />
          <path d="M8 9h8M8 13h6" />
        </>
      )}
      {name === "activity" && (
        <>
          <path d="M4 16h3l2.5-8 4 11 2.5-7h4" />
          <path d="M4 20h16" />
        </>
      )}
      {name === "refund" && (
        <>
          <path d="M8 8h7a4 4 0 0 1 0 8H7" />
          <path d="M8 5 5 8l3 3" />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      )}
      {name === "bell" && (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9Z" />
          <path d="M10 21h4" />
        </>
      )}
      {name === "chat" && (
        <>
          <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4A3.5 3.5 0 0 1 15.5 14H11l-5 4v-4.3A3.5 3.5 0 0 1 5 10.5v-4Z" />
          <path d="M9 8h6M9 11h4" />
        </>
      )}
      {name === "mail" && (
        <>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="m5 8 7 5 7-5" />
        </>
      )}
      {name === "money" && (
        <>
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M7 10v4M17 10v4" />
        </>
      )}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "x" && <path d="m7 7 10 10M17 7 7 17" />}
      {name === "handshake" && (
        <>
          <path d="m7 13 3-3 3 3 4-4" />
          <path d="M3 11l4-4 4 4M21 11l-4-4-4 4" />
          <path d="M8 15l2 2a3 3 0 0 0 4 0l2-2" />
        </>
      )}
      {name === "growth" && (
        <>
          <path d="M5 18c7 0 11-4 14-12" />
          <path d="M14 6h5v5" />
          <path d="M5 18v-5M9 18v-7M13 18v-9" />
        </>
      )}
      {name === "spark" && (
        <>
          <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
          <path d="m6 6 3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
        </>
      )}
      {name === "back" && <path d="M14 7 9 12l5 5" />}
    </svg>
  );
}
