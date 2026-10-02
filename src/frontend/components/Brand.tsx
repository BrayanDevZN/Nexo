export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <img
        src="/images/nexo-symbol-purple.png"
        width="38"
        height="38"
        alt=""
        aria-hidden="true"
        decoding="async"
      />
      {!compact && (
        <span>
          nexo<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
