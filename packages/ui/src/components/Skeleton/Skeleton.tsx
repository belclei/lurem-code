import type { CSSProperties } from "react";

export type SkeletonShape = "text" | "circle" | "rect";

export interface SkeletonProps {
  shape?: SkeletonShape;
  /** CSS width, e.g. "100%", "12rem", 240. */
  width?: string | number;
  /** CSS height. Defaults to "1em" for `text`, "100%" for the others. */
  height?: string | number;
  className?: string;
}

/**
 * Loading placeholder with a light shimmer sweep. Purely decorative — the
 * surrounding view is responsible for announcing loading state to assistive
 * tech (e.g. a `role="status"` region wrapping a group of these).
 */
export function Skeleton({
  shape = "rect",
  width,
  height,
  className = "",
}: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height: height ?? (shape === "text" ? "1em" : undefined),
  };

  const radius =
    shape === "circle"
      ? "rounded-full"
      : shape === "text"
        ? "rounded-[var(--lr-r-sm)]"
        : "rounded-[var(--lr-r-md)]";

  return (
    <span
      aria-hidden="true"
      style={style}
      className={[
        "relative block overflow-hidden bg-[var(--lr-border)]/50",
        shape === "circle" ? "aspect-square" : "",
        radius,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent",
          "via-white/50 dark:via-white/15",
          // index.html id="carregando", `.hmc-skeleton`: 1600ms, and eased
          // with the same --lr-ease-settle token every other "things
          // settling into place" motion in this system uses (not a
          // hardcoded ease-in-out) — timing already matched, this was the
          // one real drift from the reference's shimmer.
          // Bounded to 5 cycles (~8s) with fill-mode forwards instead of
          // `infinite`: an unbounded loop is a WCAG 2.2.2 (Pause, Stop,
          // Hide) violation for a load stuck past 5s and users without the
          // OS-level prefers-reduced-motion flag set. The keyframe's only
          // step ends at translateX(100%) (fully swept off), so freezing
          // there just leaves the static base skeleton block — still
          // legible as "loading", no perpetual motion.
          "animate-[lr-skeleton-shimmer_1.6s_var(--lr-ease-settle)_5_forwards]",
        ].join(" ")}
      />
    </span>
  );
}
