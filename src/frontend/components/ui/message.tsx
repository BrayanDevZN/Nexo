import { type ComponentProps } from "react";
import { cn } from "cn";
export function Message({ align = "start", className, ...props }: ComponentProps<"article"> & { align?: "start" | "end" }) { return <article data-slot="message" data-align={align} className={cn("flex gap-3", align === "end" ? "justify-end" : "justify-start", className)} {...props} />; }
export function MessageContent({ className, ...props }: ComponentProps<"div">) { return <div className={cn("flex max-w-full flex-col gap-1", className)} {...props} />; }
export function MessageFooter({ className, ...props }: ComponentProps<"p">) { return <p className={cn("text-xs text-muted-foreground", className)} {...props} />; }
