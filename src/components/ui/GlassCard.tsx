"use client";

import React from "react";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  interactive?: boolean;
  children?: React.ReactNode;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ strong = false, interactive = false, className = "", style, children, ...props }, ref) => {
    const baseClass = strong ? "glass-strong" : "glass";
    const interactiveClass = interactive ? "interactive-glass" : "";
    const combinedClassName = `${baseClass} ${interactiveClass} ${className}`.trim();

    return (
      <div ref={ref} className={combinedClassName} style={style} {...props}>
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
