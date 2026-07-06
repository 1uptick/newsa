import React from "react";
import { Sparkles } from "lucide-react";

const SPINNER_SIZE = {
  sm: {
    box: "h-8 w-8",
    innerRing: "inset-[0.28rem]",
    iconWrap: "h-5 w-5",
    icon: "h-2.5 w-2.5",
  },
  md: {
    box: "h-10 w-10",
    innerRing: "inset-[0.35rem]",
    iconWrap: "h-7 w-7",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    box: "h-[4.5rem] w-[4.5rem]",
    innerRing: "inset-[0.45rem]",
    iconWrap: "h-9 w-9",
    icon: "h-[1.125rem] w-[1.125rem]",
  },
} as const;

export type BrandedSpinnerSize = keyof typeof SPINNER_SIZE;

type BrandedSpinnerProps = {
  size?: BrandedSpinnerSize;
  className?: string;
  /** Accessible label for screen readers (spinner is decorative when inside AppPageLoader). */
  label?: string;
};

export function BrandedSpinner({ size = "lg", className = "", label = "Loading" }: BrandedSpinnerProps) {
  const s = SPINNER_SIZE[size];

  return (
    <div
      className={`relative flex items-center justify-center ${s.box} ${className}`.trim()}
      role="status"
      aria-label={label}
    >
      <span className="absolute inset-0 rounded-full bg-[#ff7900]/12 blur-md animate-pulse" aria-hidden />
      <span className="absolute inset-0 rounded-full border-2 border-[#ff7900]/20" aria-hidden />
      <span
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#ff7900] border-r-[#ff7900]/50 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <span
        className={`absolute ${s.innerRing} rounded-full border-2 border-transparent border-b-[#e66d00] border-l-[#ff7900]/40 animate-spin motion-reduce:animate-none [animation-duration:1.35s] [animation-direction:reverse]`}
        aria-hidden
      />
      <span
        className={`relative flex ${s.iconWrap} items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#ff7900]/20`}
      >
        <Sparkles className={`${s.icon} text-[#ff7900]`} aria-hidden />
      </span>
    </div>
  );
}
