import * as React from "react"
import { ResponsiveContainer, Tooltip } from "recharts"
import { cn } from "cn"

export type ChartConfig = Record<string, { label: string; color: string }>

export function ChartContainer({ className, config, children, style, "aria-label": ariaLabel }: {
  className?: string
  config: ChartConfig
  children: React.ReactElement
  style?: React.CSSProperties
  "aria-label"?: string
}) {
  const id = React.useId().replace(/:/g, "")
  return <div data-slot="chart" data-chart={id} aria-label={ariaLabel} style={style} className={cn("w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-surface]:outline-none", className)}>
    <style>{`[data-chart="${id}"] { ${Object.entries(config).map(([key, item]) => `--color-${key}: ${item.color};`).join(" ")} }`}</style>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
  </div>
}

export const ChartTooltip = Tooltip

type ChartPayloadItem = { dataKey?: string | number; name?: string | number; value?: number | string; color?: string }
export function ChartTooltipContent({ active, payload, label, formatter }: {
  active?: boolean
  payload?: ChartPayloadItem[]
  label?: unknown
  formatter?: (value: number, name: string) => React.ReactNode
}) {
  if (!active || !payload?.length) return null
  return <div className="grid min-w-[9rem] gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
    <div className="font-medium">{String(label ?? "")}</div>
    {payload.map((entry: ChartPayloadItem, index: number) => <div key={`${entry.dataKey}-${index}`} className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-[2px]" style={{ backgroundColor: entry.color }} />{String(entry.name ?? entry.dataKey)}</span>
      <span className="font-mono font-medium tabular-nums">{formatter && typeof entry.value === "number" ? formatter(entry.value, String(entry.name ?? entry.dataKey)) : String(entry.value ?? "—")}</span>
    </div>)}
  </div>
}
