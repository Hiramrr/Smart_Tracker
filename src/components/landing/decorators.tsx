/* ── Curved decorative line ─────────────────────────────────────── */
export function CurvedLine({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M40 360 C40 160 160 200 200 120 C240 40 320 80 360 40"
        stroke="#B5CBB9"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M80 380 C80 200 180 240 220 160 C260 80 340 100 380 60"
        stroke="#DDD9D0"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

/* ── Dotted circle ─────────────────────────────────────────────── */
export function DottedCircle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="100"
        cy="100"
        r="90"
        stroke="#DDD9D0"
        strokeWidth="1.5"
        strokeDasharray="3 8"
      />
      <circle
        cx="100"
        cy="100"
        r="60"
        stroke="#B5CBB9"
        strokeWidth="1"
        strokeDasharray="2 10"
        opacity="0.4"
      />
    </svg>
  );
}

/* ── Plus decorator (+) ────────────────────────────────────────── */
export function PlusDecorator({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 5V19M5 12H19"
        stroke="#204E46"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Star / sparkle decorator ──────────────────────────────────── */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L13.5 8.5L20 7L14.5 11L18 17L12 13.5L6 17L9.5 11L4 7L10.5 8.5L12 2Z"
        stroke="#B5CBB9"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="#B5CBB9"
        opacity="0.3"
      />
    </svg>
  );
}

/* ── Diamond decorator ─────────────────────────────────────────── */
export function Diamond({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M8 1L15 8L8 15L1 8Z"
        stroke="#B5CBB9"
        strokeWidth="1"
        fill="#B5CBB9"
        opacity="0.15"
      />
    </svg>
  );
}

/* ── Small dot ─────────────────────────────────────────────────── */
export function SmallDot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="4" cy="4" r="3" fill="#204E46" opacity="0.3" />
    </svg>
  );
}

/* ── Ring decorator ────────────────────────────────────────────── */
export function Ring({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="#C4B5E0"
        strokeWidth="1.5"
        opacity="0.4"
      />
    </svg>
  );
}

/* ── Light Sparkle (#E1E2D8) ───────────────────────────────────── */
export function LightSparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L13.5 8.5L20 7L14.5 11L18 17L12 13.5L6 17L9.5 11L4 7L10.5 8.5L12 2Z"
        stroke="#E1E2D8"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="#E1E2D8"
        opacity="0.6"
      />
    </svg>
  );
}

/* ── Light Ring (#E1E2D8) ──────────────────────────────────────── */
export function LightRing({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="#E1E2D8"
        strokeWidth="1.5"
        opacity="0.7"
      />
    </svg>
  );
}
