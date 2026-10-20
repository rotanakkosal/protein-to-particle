"use client";

/** Shown while the PDB structure is fetched and the 3D models are prepared. */
export function LoadingState({
  label = "Loading structure…",
  error,
  onRetry,
  onBack,
  backLabel = "Back to Ubiquitin",
}: {
  label?: string;
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <p className="font-display text-xl font-bold text-brand-ink">The protein structure could not be loaded</p>
            <p className="max-w-sm text-[13px] text-muted">{error}</p>
            <div className="flex gap-2">
              {onRetry && (
                <button type="button" onClick={onRetry} className="rounded-full bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark">
                  Try again
                </button>
              )}
              {onBack && (
                <button type="button" onClick={onBack} className="rounded-full border border-line bg-surface px-4 py-1.5 text-[13px] font-medium text-brand-ink hover:border-brand">
                  {backLabel}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="spin-slow block h-7 w-7 rounded-full border-2 border-brand/25 border-t-brand" aria-hidden />
            <p className="text-[13px] text-muted" role="status">
              {label}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
