export function LinkifyLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="28" height="28" rx="8" fill="#0000F5" />
        <path
          d="M9.5 8.5V19.5H18.5"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="10.5" r="2.2" fill="#FFFFFF" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <span className="block text-[17px] font-semibold tracking-tight text-[#1A1A2E]">
            Linkify
          </span>
          <span className="block text-[11px] font-medium text-[#6B7280]">
            Growth OS
          </span>
        </div>
      )}
    </div>
  );
}
