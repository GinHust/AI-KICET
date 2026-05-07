import type { HTMLAttributes, ReactNode } from "react";

type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: "default" | "muted" | "contrast";
};

const toneClasses: Record<NonNullable<SurfaceCardProps["tone"]>, string> = {
  default: "border-line/90 bg-surface shadow-card",
  muted: "border-line/80 bg-surface-muted/95 shadow-card",
  contrast: "border-line-strong/70 bg-surface-contrast/95 shadow-card"
};

export function SurfaceCard({ children, className = "", tone = "default", ...props }: SurfaceCardProps) {
  const classes = [
    "rounded-card border backdrop-blur-sm",
    toneClasses[tone],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
