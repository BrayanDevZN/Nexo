import {
  AlertCircle,
  ArrowDown,
  Check,
  FileText,
  Receipt,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const incoming = [
  { icon: FileText, label: "Extrato" },
  { icon: Receipt, label: "Nota fiscal" },
  { icon: Wallet, label: "Comprovante" },
];

const board = [
  { client: "Cliente A", status: "Completo", ok: true },
  { client: "Cliente B", status: "Completo", ok: true },
  { client: "Cliente C", status: "Falta o extrato", ok: false },
];

/** Illustrative only: no real client, no numbers. Same "visão ilustrativa" treatment as the home page. */
export function AccountingVisual() {
  return (
    <figure
      className="operation-visual lp-visual"
      aria-label="Ilustração: extratos, notas fiscais e comprovantes chegam soltos e são organizados por cliente. Uma pendência fica sinalizada para a equipe conferir."
    >
      <div className="visual-topline" aria-hidden="true">
        <span className="tiny-label">Documentos do período</span>
        <Badge variant="outline">Visão ilustrativa</Badge>
      </div>
      <div className="lp-visual-incoming" aria-hidden="true">
        {incoming.map((item) => (
          <div key={item.label}>
            <item.icon />
            {item.label}
          </div>
        ))}
      </div>
      <ArrowDown className="lp-visual-arrow" aria-hidden="true" />
      <ul className="lp-visual-board" aria-hidden="true">
        {board.map((row) => (
          <li key={row.client}>
            <strong>{row.client}</strong>
            <Badge variant={row.ok ? "secondary" : "outline"}>
              {row.ok ? (
                <Check data-icon="inline-start" />
              ) : (
                <AlertCircle data-icon="inline-start" />
              )}
              {row.status}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="lp-visual-note" aria-hidden="true">
        <UserCheck />A equipe confere antes do registro final.
      </p>
    </figure>
  );
}
