import { useState, type CSSProperties } from "react";
import { cn } from "cn";
import { type XlsxCell, type XlsxSheet } from "./xlsxReader";

const HEADER_ROW_HEIGHT = 36;

function cellStyle(cell: XlsxCell, width: number): CSSProperties {
  const { style } = cell;
  const align = style?.align ?? (cell.numeric ? "right" : "left");
  return {
    textAlign: align,
    backgroundColor: style?.background,
    color: style?.color ?? (style?.background ? "#1f2937" : undefined),
    fontWeight: style?.bold ? 700 : undefined,
    fontStyle: style?.italic ? "italic" : undefined,
    maxWidth: style?.wrap ? width : undefined,
  };
}

export function XlsxPreview({ sheets, filename }: { sheets: XlsxSheet[]; filename: string }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const columns = sheet.widths.length;
  const tableWidth = sheet.widths.reduce((sum, width) => sum + width, 0);
  // Frozen rows stay visible while scrolling; each one sticks below the rows above it.
  const stickyTop: number[] = [];
  for (let r = 0, top = 0; r < sheet.frozenRows; r++) { stickyTop[r] = top; top += sheet.heights[r] ?? HEADER_ROW_HEIGHT; }

  return <div data-testid="xlsx-preview" className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-auto">
      {columns === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Esta aba está vazia.</p>
        : <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", width: tableWidth, minWidth: "100%" }} aria-label={`${sheet.name} de ${filename}`}>
          <colgroup>{sheet.widths.map((width, c) => <col key={c} style={{ width }} />)}</colgroup>
          <tbody>
            {sheet.rows.map((row, r) => {
              const frozen = r < sheet.frozenRows;
              const height = sheet.heights[r] ?? (frozen ? HEADER_ROW_HEIGHT : undefined);
              return <tr key={r} style={height ? { height } : undefined}>
                {row.map((cell, c) => {
                  if (cell === null) return null;
                  const wrap = cell.style?.wrap;
                  return <td key={c} colSpan={cell.colSpan} rowSpan={cell.rowSpan} title={cell.text.length > 24 ? cell.text : undefined}
                    className={cn("border-b border-r border-border/60 px-2.5 py-1.5 align-middle first:border-l",
                      wrap ? "whitespace-pre-wrap break-words" : "overflow-hidden text-ellipsis whitespace-nowrap",
                      frozen && "sticky z-10 shadow-[0_1px_0_var(--border)]",
                      frozen && !cell.style?.background && "bg-background",
                      !frozen && !cell.style?.background && r % 2 === 1 && "bg-muted/30")}
                    style={{ ...cellStyle(cell, sheet.widths[c] ?? 72), ...(frozen ? { top: stickyTop[r] } : null) }}>
                    {cell.text}
                  </td>;
                })}
              </tr>;
            })}
          </tbody>
        </table>}
    </div>
    <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2">
      <div role="tablist" aria-label="Abas da planilha" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {sheets.map((item, index) => <button key={`${item.name}-${index}`} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)}
          className={cn("shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors", index === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          {item.name}
        </button>)}
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        {sheet.rows.length} {sheet.rows.length === 1 ? "linha" : "linhas"} · {columns} {columns === 1 ? "coluna" : "colunas"}{sheet.truncated ? " · mostrando o início" : ""}
      </p>
    </div>
  </div>;
}
