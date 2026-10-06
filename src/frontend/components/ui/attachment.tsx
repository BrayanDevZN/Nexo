import { type ComponentProps } from "react";
import { cn } from "cn";
export function Attachment({ state = "done", className, ...props }: ComponentProps<"div"> & { state?: "done" | "uploading" | "error" }) { return <div data-slot="attachment" data-state={state} className={cn("flex max-w-full flex-col gap-2 rounded-lg border border-border p-3", className)} {...props} />; }
export function AttachmentMedia({ className, ...props }: ComponentProps<"div">) { return <div className={cn("min-w-0 overflow-hidden rounded-md", className)} {...props} />; }
export function AttachmentDescription({ className, ...props }: ComponentProps<"p">) { return <p className={cn("text-sm text-muted-foreground", className)} {...props} />; }
