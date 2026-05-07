import type { HTMLAttributes, ReactNode } from "react";

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: "neutral" | "research" | "bo" | "xai" | "success";
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "border-line bg-white/65 text-soft",
  research: "border-research/15 bg-research/8 text-research",
  bo: "border-bo/15 bg-bo/10 text-bo",
  xai: "border-xai/15 bg-xai/10 text-xai",
  success: "border-success/15 bg-success/10 text-success"
};

export function StatusBadge({ children, className = "", tone = "neutral", ...props }: StatusBadgeProps) {
  const classes = [
    "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em]",
    toneClasses[tone],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
