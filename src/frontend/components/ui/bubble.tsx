import { type ComponentProps } from "react";
import { cn } from "cn";
export function Bubble({ variant = "muted", className, ...props }: ComponentProps<"div"> & { variant?: "default" | "muted" }) { return <div data-slot="bubble" className={cn("rounded-2xl px-4 py-3", variant === "default" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground", className)} {...props} />; }
export function BubbleContent({ className, ...props }: ComponentProps<"div">) { return <div className={cn("whitespace-pre-wrap break-words", className)} {...props} />; }
