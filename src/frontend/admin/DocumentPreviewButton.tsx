import { useEffect, useState } from "react";
import { Download, Eye, FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type createApi } from "./api";
import { XlsxPreview } from "./XlsxPreview";
import { type XlsxSheet } from "./xlsxReader";

type PreviewDocument = { id: string; filename: string };
type Preview = { kind: "text"; content: string } | { kind: "sheets"; sheets: XlsxSheet[] } | { kind: "visual"; url: string; mime: string } | { kind: "zip"; entries: string[]; truncated: boolean } | { kind: "unsupported"; detail?: string };

const TEXT_EXTENSIONS = new Set(["txt", "csv", "json", "yaml", "yml"]);
const OFFICE_EXTENSIONS = new Set(["docx", "pptx", "odt", "ods", "rtf"]);
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};

async function officeText(source: Blob, filename: string) {
  const { OfficeParser } = await import("officeparser/slim");
  const ast = await OfficeParser.parseOffice(new File([source], filename, { type: source.type }));
  return (await ast.to("text")).value || "O arquivo não contém texto extraível.";
}

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function DocumentPreviewButton({ api, item, onError, size = "default" }: {
  api: ReturnType<typeof createApi>; item: PreviewDocument; onError?: (error: string) => void;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [objectUrl, setObjectUrl] = useState("");
  const ext = extensionOf(item.filename);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  async function loadPreview() {
    setOpen(true);
    setPreview(null);
    setObjectUrl("");
    setBusy(true);
    onError?.("");
    try {
      const source = await api.file(`/documents/${encodeURIComponent(item.id)}/download`);
      if (TEXT_EXTENSIONS.has(ext)) {
        setPreview({ kind: "text", content: await source.text() });
      } else if (ext === "zip") {
        const { default: JSZip } = await import("jszip");
        const archive = await JSZip.loadAsync(source, { checkCRC32: false });
        const entries = Object.values(archive.files).filter(file => !file.dir).map(file => file.name);
        setPreview({ kind: "zip", entries: entries.slice(0, 500), truncated: entries.length > 500 });
      } else if (ext === "xlsx") {
        try {
          const { readXlsx } = await import("./xlsxReader");
          setPreview({ kind: "sheets", sheets: await readXlsx(source) });
        } catch {
          // Unusual workbooks still get a plain-text preview instead of an error.
          setPreview({ kind: "text", content: await officeText(source, item.filename) });
        }
      } else if (OFFICE_EXTENSIONS.has(ext)) {
        setPreview({ kind: "text", content: await officeText(source, item.filename) });
      } else if (MIME_BY_EXTENSION[ext] || source.type.startsWith("image/")) {
        const mime = MIME_BY_EXTENSION[ext] || source.type;
        const url = URL.createObjectURL(new Blob([source], { type: mime }));
        setObjectUrl(url);
        setPreview({ kind: "visual", url, mime });
      } else {
        setPreview({ kind: "unsupported" });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      setPreview({ kind: "unsupported", detail });
      if (detail?.includes("conectar") || detail?.includes("sessão") || detail?.includes("permissão")) onError?.(detail);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    try {
      const blob = await api.file(`/documents/${encodeURIComponent(item.id)}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Não foi possível baixar o documento.");
    }
  }

  return <>
    <Button variant="outline" size={size} onClick={() => void loadPreview()} aria-label={`Ver ${item.filename}`}>
      <Eye data-icon="inline-start" /> Ver
    </Button>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setPreview(null); setObjectUrl(""); } }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-6xl flex-col overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle className="break-all">{item.filename}</DialogTitle>
          <DialogDescription>Pré-visualização do arquivo salvo na Nexo.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
          {busy ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Preparando visualização…</div>
            : !preview ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Clique em Ver para carregar o arquivo.</div>
              : preview.kind === "sheets" ? <div className="h-[65dvh] min-h-80"><XlsxPreview sheets={preview.sheets} filename={item.filename} /></div>
                : preview.kind === "text" ? <pre className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6">{preview.content}</pre>
                : preview.kind === "visual" && preview.mime === "application/pdf" ? <iframe title={`Pré-visualização de ${item.filename}`} src={preview.url} className="h-[65dvh] min-h-96 w-full" />
                  : preview.kind === "visual" ? <div className="flex min-h-64 items-center justify-center p-4"><img src={preview.url} alt={`Pré-visualização de ${item.filename}`} className="max-h-[65dvh] max-w-full object-contain" /></div>
                    : preview.kind === "zip" ? <div className="p-4"><p className="mb-3 text-sm text-muted-foreground">{preview.entries.length} arquivos{preview.truncated ? " (lista limitada aos primeiros 500)" : ""}</p><ul className="space-y-2">{preview.entries.map(name => <li key={name} className="flex items-center gap-2 break-all text-sm"><FileText className="size-4 shrink-0 text-muted-foreground" />{name}</li>)}</ul>{!preview.entries.length && <p className="text-sm text-muted-foreground">O arquivo ZIP não contém arquivos visíveis.</p>}</div>
                      : <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center"><FileText className="size-8 text-muted-foreground" /><p className="font-medium">Não foi possível gerar uma prévia deste formato.</p><p className="max-w-xl text-sm text-muted-foreground">O arquivo continua disponível para baixar. Formatos antigos do Office (.doc, .xls e .ppt) precisam ser convertidos para DOCX, XLSX ou PPTX para aparecer aqui.</p>{preview.detail && <p className="max-w-xl break-words text-xs text-muted-foreground">{preview.detail}</p>}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => void download()}><Download data-icon="inline-start" /> Baixar arquivo</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
