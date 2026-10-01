import {
  ArrowDown,
  Check,
  Database,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OperationVisual() {
  return (
    <figure
      className="operation-visual"
      aria-label="Exemplo de fluxo: documentos e sistemas conectados à IA, com validação antes da execução."
    >
      <div className="visual-topline">
        <span className="tiny-label">UMA OPERAÇÃO CONECTADA</span>
        <Badge variant="outline">Fluxo ilustrativo</Badge>
      </div>
      <div className="sources">
        <div>
          <Mail aria-hidden="true" />
          <span>E-mails</span>
        </div>
        <div>
          <FileText aria-hidden="true" />
          <span>Documentos</span>
        </div>
        <div>
          <Database aria-hidden="true" />
          <span>Seus sistemas</span>
        </div>
      </div>
      <div className="connector-branches" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="intelligence-node">
        <div className="node-symbol">
          <Brand compact />
        </div>
        <div>
          <span className="tiny-label">INTELIGÊNCIA APLICADA</span>
          <strong>Contexto. Decisão. Ação.</strong>
        </div>
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <div className="connector-line" aria-hidden="true" />
      <Card className="mx-auto w-[88%]">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Um fluxo, do início ao fim</CardTitle>
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          </div>
          <CardDescription>Regras e revisão onde importam.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="execution-list">
            <li>
              <Check aria-hidden="true" />
              <span>Informações organizadas</span>
              <span>01</span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>Dados validados</span>
              <span>02</span>
            </li>
            <li>
              <ArrowDown aria-hidden="true" />
              <span>Próxima ação no sistema</span>
              <span>03</span>
            </li>
          </ol>
        </CardContent>
      </Card>
      <figcaption>
        <span className="signal-dot" /> Pessoas no controle. Tecnologia na
        execução.
      </figcaption>
    </figure>
  );
}
