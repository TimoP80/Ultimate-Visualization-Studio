/** Minimal line-icon set. Props are sized in CSS by the caller. */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 14, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 3.2v9.6L13 8z" fill="currentColor" stroke="none" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="2.6" height="9" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="9.4" y="3.5" width="2.6" height="9" rx="0.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.5h6.2a3.3 3.3 0 0 1 0 6.6H6" />
    <path d="M5.6 3.6 2.8 6.5l2.8 2.9" />
  </Svg>
);

export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 6.5H6.8a3.3 3.3 0 0 0 0 6.6H10" />
    <path d="M10.4 3.6l2.8 2.9-2.8 2.9" />
  </Svg>
);

export const ImportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.5V2.5" />
    <path d="M4.8 5.7 8 2.5l3.2 3.2" />
    <path d="M2.8 10.5v2.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-2.2" />
  </Svg>
);

export const ExportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v8" />
    <path d="M4.8 7.3 8 10.5l3.2-3.2" />
    <path d="M2.8 11v1.7a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8V11" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.1" />
    <path d="m10.2 10.2 3 3" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.4h10" />
    <path d="M6.2 4.4V3.2a.7.7 0 0 1 .7-.7h2.2a.7.7 0 0 1 .7.7v1.2" />
    <path d="M4.4 4.4l.6 8.3a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8l.6-8.3" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.2" y="5.2" width="7.6" height="7.6" rx="1.2" />
    <path d="M10.8 3.2H4.4a1.2 1.2 0 0 0-1.2 1.2v6.4" />
  </Svg>
);

export const EyeIcon = ({ open, ...p }: IconProps & { open: boolean }) => (
  <Svg {...p}>
    <path d="M1.8 8s2.3-4.1 6.2-4.1S14.2 8 14.2 8 11.9 12.1 8 12.1 1.8 8 1.8 8Z" />
    <circle cx="8" cy="8" r="1.9" />
    {!open && <path d="M2.4 13.6 13.6 2.4" />}
  </Svg>
);

export const LockIcon = ({ locked, ...p }: IconProps & { locked: boolean }) => (
  <Svg {...p}>
    <rect x="4.2" y="7.2" width="7.6" height="6" rx="1.2" />
    {locked ? <path d="M6.2 7.2V5.6a1.8 1.8 0 0 1 3.6 0v1.6" /> : <path d="M6.2 7.2V5.6a1.8 1.8 0 0 1 3.4-.8" />}
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 6V2.8H6M10 2.8h3.2V6M13.2 10v3.2H10M6 13.2H2.8V10" />
  </Svg>
);

export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 0 1 5-5h3.2" />
    <path d="m9.6 1.6 1.8 1.4-1.8 1.4" />
    <path d="M13 8a5 5 0 0 1-5 5H4.8" />
    <path d="m6.4 14.4-1.8-1.4 1.8-1.4" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 2.2 5.6 3L8 8.2 2.4 5.2z" />
    <path d="m2.4 8.4 5.6 3 5.6-3" />
    <path d="m2.4 11.2 5.6 3 5.6-3" />
  </Svg>
);

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.4 4h9.2M3.4 8h9.2M3.4 12h9.2" />
    <circle cx="6" cy="4" r="1.3" />
    <circle cx="10" cy="8" r="1.3" />
    <circle cx="5.2" cy="12" r="1.3" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.2v3.2M8 10.6v3.2M2.2 8h3.2M10.6 8h3.2" />
    <path d="m4.4 4.4 1.8 1.8M9.8 9.8l1.8 1.8M11.6 4.4 9.8 6.2M4.2 11.6l1.8-1.8" />
  </Svg>
);
