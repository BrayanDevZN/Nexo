import { useId, type ComponentProps, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
export { Field, FieldGroup, FieldLabel };

export function TextField({ label, help, ...props }: ComponentProps<typeof Input> & { label: string; help?: string }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} {...props} />{help && <FieldDescription>{help}</FieldDescription>}</Field>;
}
export function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
    <AlertTitle>{error ? "Não foi possível concluir" : "Tudo certo"}</AlertTitle>
    <AlertDescription>{error || success}</AlertDescription>
  </Alert>;
}
export function Busy({ children }: { children?: ReactNode }) {
  return <span className="flex items-center gap-2" role="status"><LoaderCircle className="size-4 animate-spin" />{children || "Carregando…"}</span>;
}
export function Loading() {
  return <div className="flex flex-col gap-4" role="status" aria-label="Carregando painel">
    <Skeleton className="h-8 w-48" /><Skeleton className="h-36 w-full" /><Skeleton className="h-36 w-full" />
  </div>;
}
export function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a ação."; }
export function passwordValid(value: string) { return value.length >= 12 && new TextEncoder().encode(value).length <= 72; }
