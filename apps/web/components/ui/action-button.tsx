import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "research" | "bo" | "xai" | "neutral";
  variant?: "solid" | "subtle";
};

const toneClasses = {
  research: {
    solid: "border-research/20 bg-research text-white hover:bg-research/90",
    subtle: "border-research/18 bg-research/8 text-research hover:bg-research/12"
  },
  bo: {
    solid: "border-bo/20 bg-bo text-white hover:bg-bo/90",
    subtle: "border-bo/18 bg-bo/10 text-bo hover:bg-bo/14"
  },
  xai: {
    solid: "border-xai/20 bg-xai text-white hover:bg-xai/90",
    subtle: "border-xai/18 bg-xai/10 text-xai hover:bg-xai/14"
  },
  neutral: {
    solid: "border-line-strong bg-ink text-white hover:bg-ink/92",
    subtle: "border-line bg-white/70 text-ink hover:bg-white"
  }
} as const;

export function ActionButton({ children, className = "", tone = "neutral", variant = "solid", ...props }: ActionButtonProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50",
    toneClasses[tone][variant],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
