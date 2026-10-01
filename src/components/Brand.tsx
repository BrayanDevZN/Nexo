export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M5 25V7h5l12 18h5V7M5 7l22 18"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span>
          nexo<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
