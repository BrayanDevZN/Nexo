import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "cn"

const EMPTY_VALUE = "__nexo_empty_option__"

type NativeSelectProps = {
  children: React.ReactNode
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (event: { target: { value: string } }) => void
  size?: "sm" | "default"
}

function NativeSelect({ children, className, disabled, id, name, value, defaultValue, onChange }: NativeSelectProps) {
  const mapValue = (item: string | undefined) => item === "" ? EMPTY_VALUE : item
  return <SelectPrimitive.Root
    name={name}
    value={mapValue(value)}
    defaultValue={mapValue(defaultValue)}
    disabled={disabled}
    onValueChange={next => onChange?.({ target: { value: next === EMPTY_VALUE ? "" : next } })}
  >
    <SelectPrimitive.Trigger id={id} data-slot="native-select" className={cn("cn-input flex h-11 w-full items-center justify-between gap-2 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", className)}>
      <SelectPrimitive.Value />
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={4} className="z-[100] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
}

function NativeSelectOption({ className, value, children, ...props }: React.ComponentProps<"option">) {
  const normalizedValue = value == null ? "" : String(value)
  return <SelectPrimitive.Item data-slot="native-select-option" className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} value={normalizedValue === "" ? EMPTY_VALUE : normalizedValue} disabled={props.disabled}>
    <span className="absolute right-2 flex size-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
}

function NativeSelectOptGroup({ label, children }: React.ComponentProps<"optgroup">) {
  return <SelectPrimitive.Group><SelectPrimitive.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{label}</SelectPrimitive.Label>{children}</SelectPrimitive.Group>
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
