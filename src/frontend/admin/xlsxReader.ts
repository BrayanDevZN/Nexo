// Lightweight XLSX reader for the document preview: values, merges, column widths and the
// basic cell look (fill, bold, colour, alignment). It only depends on JSZip and has no DOM
// requirement, so it runs the same in the browser and in unit tests.

export type XlsxCellStyle = {
  bold?: boolean; italic?: boolean; color?: string; background?: string;
  align?: "left" | "center" | "right"; wrap?: boolean; border?: boolean;
};
export type XlsxCell = { text: string; numeric: boolean; style?: XlsxCellStyle; colSpan?: number; rowSpan?: number };
export type XlsxSheet = {
  name: string; widths: number[]; heights: (number | undefined)[]; rows: (XlsxCell | null)[][];
  frozenRows: number; truncated: boolean;
};

export const XLSX_LIMITS = { rows: 1000, columns: 40, sheets: 20, bytes: 25 * 1024 * 1024 };

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const local = (name: string) => name.slice(name.indexOf(":") + 1);
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  for (const match of xml.matchAll(TOKEN)) {
    const [, cdata, closing, rawName, rawAttrs, selfClosing, text] = match;
    const top = stack[stack.length - 1];
    if (cdata !== undefined) top.text += cdata;
    else if (text !== undefined) top.text += decode(text);
    else if (closing && rawName) { if (stack.length > 1) stack.pop(); }
    else if (rawName) {
      const attrs: Record<string, string> = {};
      for (const attr of (rawAttrs || "").matchAll(ATTR)) attrs[local(attr[1])] = decode(attr[2] ?? attr[3] ?? "");
      const node: XmlNode = { name: local(rawName), attrs, children: [], text: "" };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

const child = (node: XmlNode | undefined, name: string) => node?.children.find(item => item.name === name);
const kids = (node: XmlNode | undefined, name: string) => node?.children.filter(item => item.name === name) ?? [];

function plainText(node: XmlNode): string {
  if (node.name === "rPh" || node.name === "phoneticPr") return "";
  return node.name === "t" ? node.text : node.children.map(plainText).join("");
}

export function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}
const rowIndex = (ref: string) => parseInt(/\d+/.exec(ref)?.[0] ?? "0", 10) - 1;

function cssColor(node: XmlNode | undefined) {
  const rgb = node?.attrs.rgb;
  return rgb && /^[0-9a-f]{8}$/i.test(rgb) ? `#${rgb.slice(2)}` : undefined;
}

const BUILTIN_FORMATS: Record<number, string> = {
  1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 14: "dd/mm/yyyy", 15: "d-mmm-yy", 16: "d-mmm",
  17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "dd/mm/yyyy h:mm",
  37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mm:ss.0",
};

type StyleSheet = { formats: Map<number, string>; xfs: { format: string; style?: XlsxCellStyle }[] };

function readStyles(xml: string | undefined): StyleSheet {
  const sheet: StyleSheet = { formats: new Map(), xfs: [] };
  if (!xml) return sheet;
  const root = child(parseXml(xml), "styleSheet");
  for (const format of kids(child(root, "numFmts"), "numFmt")) sheet.formats.set(Number(format.attrs.numFmtId), format.attrs.formatCode ?? "");
  const fonts = kids(child(root, "fonts"), "font");
  const fills = kids(child(root, "fills"), "fill");
  const borders = kids(child(root, "borders"), "border");
  for (const xf of kids(child(root, "cellXfs"), "xf")) {
    const font = fonts[Number(xf.attrs.fontId)];
    const pattern = child(fills[Number(xf.attrs.fillId)], "patternFill");
    const alignment = child(xf, "alignment");
    const border = borders[Number(xf.attrs.borderId)];
    const style: XlsxCellStyle = {};
    if (font && child(font, "b") && child(font, "b")?.attrs.val !== "0") style.bold = true;
    if (font && child(font, "i") && child(font, "i")?.attrs.val !== "0") style.italic = true;
    const color = cssColor(child(font, "color"));
    if (color && color !== "#000000") style.color = color;
    const background = pattern?.attrs.patternType === "solid" ? cssColor(child(pattern, "fgColor")) : undefined;
    if (background && background !== "#FFFFFF") style.background = background;
    const horizontal = alignment?.attrs.horizontal;
    if (horizontal === "center" || horizontal === "centerContinuous") style.align = "center";
    else if (horizontal === "right") style.align = "right";
    else if (horizontal === "left") style.align = "left";
    if (alignment?.attrs.wrapText === "1" || alignment?.attrs.wrapText === "true") style.wrap = true;
    if (border && ["left", "right", "top", "bottom"].some(side => child(border, side)?.attrs.style)) style.border = true;
    sheet.xfs.push({ format: sheet.formats.get(Number(xf.attrs.numFmtId)) ?? BUILTIN_FORMATS[Number(xf.attrs.numFmtId)] ?? "General", style });
  }
  return sheet;
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

function isDateFormat(format: string) {
  const bare = format.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, "");
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(format);
}

function formatNumber(value: number, format: string, date1904: boolean) {
  if (isDateFormat(format)) {
    // Excel's 1900 system counts a non-existent 29/02/1900, so serials below 61 shift by one day.
    const unixDays = date1904 ? value - 24107 : value - (value >= 61 ? 25569 : 25568);
    const date = new Date(Math.round(unixDays * 86400) * 1000);
    if (Number.isNaN(date.getTime())) return String(value);
    const bare = format.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, "");
    const hasTime = /[hs]/i.test(bare);
    const hasDate = /[dy]/i.test(bare) || (/m/i.test(bare) && !hasTime);
    const day = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
    const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    return hasTime && hasDate ? `${day} ${time}` : hasTime ? time : day;
  }
  const section = format.split(";")[0].replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, "");
  const decimals = (/\.([0#?]+)/.exec(section)?.[1] ?? "").length;
  if (section.includes("%")) return `${(value * 100).toFixed(decimals).replace(".", ",")}%`;
  if (/^general$/i.test(format) || !/[0#?]/.test(section)) return String(Number(value.toPrecision(15))).replace(".", ",");
  const prefix = /^[^0#?.,]*/.exec(format.replace(/\[\$([^\]-]*)[^\]]*\]/g, "$1"))?.[0].replace(/["\\]/g, "") ?? "";
  const body = value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: section.includes(",") });
  return `${prefix.trim() ? `${prefix.trim()} ` : ""}${body}`;
}

function resolvePath(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const part of target.split("/")) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
  return parts.join("/");
}

function parseSheet(xml: string, name: string, shared: string[], styles: StyleSheet, date1904: boolean): XlsxSheet {
  const worksheet = child(parseXml(xml), "worksheet");
  const grid: (XlsxCell | null)[][] = [];
  const heights: (number | undefined)[] = [];
  let truncated = false;
  let lastRow = -1, maxColumn = -1;

  for (const row of kids(child(worksheet, "sheetData"), "row")) {
    const r = row.attrs.r ? Number(row.attrs.r) - 1 : lastRow + 1;
    lastRow = r;
    if (r >= XLSX_LIMITS.rows) { truncated = true; continue; }
    const height = row.attrs.ht ? Number(row.attrs.ht) : undefined;
    if (height && Number.isFinite(height)) heights[r] = Math.round(height * 4 / 3);
    let nextColumn = 0;
    for (const cell of kids(row, "c")) {
      const c = cell.attrs.r ? columnIndex(cell.attrs.r) : nextColumn;
      nextColumn = c + 1;
      if (c < 0) continue;
      if (c >= XLSX_LIMITS.columns) { truncated = true; continue; }
      const type = cell.attrs.t;
      const raw = child(cell, "v")?.text ?? "";
      const xf = styles.xfs[Number(cell.attrs.s ?? 0)];
      let text = "", numeric = false;
      if (type === "s") text = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") text = plainText(child(cell, "is") ?? cell);
      else if (type === "b") text = raw === "1" ? "VERDADEIRO" : "FALSO";
      else if (type === "str" || type === "e" || type === "d") text = raw;
      else if (raw !== "" && Number.isFinite(Number(raw))) { numeric = true; text = formatNumber(Number(raw), xf?.format ?? "General", date1904); }
      else text = raw;
      const style = xf?.style && Object.keys(xf.style).length ? xf.style : undefined;
      if (text === "" && !style?.background && !style?.border) continue;
      (grid[r] ??= [])[c] = { text, numeric, style };
      maxColumn = Math.max(maxColumn, c);
    }
  }

  const rowCount = Math.min(Math.max(grid.length, 0), XLSX_LIMITS.rows);
  const columnCount = maxColumn + 1;
  for (const merge of kids(child(worksheet, "mergeCells"), "mergeCell")) {
    const [from, to = from] = (merge.attrs.ref ?? "").split(":");
    const r1 = rowIndex(from), c1 = columnIndex(from), r2 = rowIndex(to), c2 = columnIndex(to);
    if (r1 < 0 || c1 < 0 || r1 >= rowCount || c1 >= columnCount) continue;
    const anchor = (grid[r1] ??= [])[c1] ??= { text: "", numeric: false };
    anchor.rowSpan = Math.min(r2, rowCount - 1) - r1 + 1;
    anchor.colSpan = Math.min(c2, columnCount - 1) - c1 + 1;
    for (let r = r1; r <= Math.min(r2, rowCount - 1); r++) for (let c = c1; c <= Math.min(c2, columnCount - 1); c++) {
      if (r !== r1 || c !== c1) (grid[r] ??= [])[c] = null;
    }
  }

  const widths: number[] = [];
  const defaultWidth = Number(child(worksheet, "sheetFormatPr")?.attrs.defaultColWidth);
  for (let c = 0; c < columnCount; c++) widths[c] = Number.isFinite(defaultWidth) && defaultWidth > 0 ? Math.round(defaultWidth * 7.5 + 8) : 72;
  for (const col of kids(child(worksheet, "cols"), "col")) {
    const width = Number(col.attrs.width);
    if (!Number.isFinite(width) || col.attrs.hidden === "1") continue;
    for (let c = Number(col.attrs.min) - 1; c < Math.min(Number(col.attrs.max), columnCount); c++) if (c >= 0) widths[c] = Math.round(width * 7.5 + 8);
  }

  const pane = child(child(child(worksheet, "sheetViews"), "sheetView"), "pane");
  const frozenRows = pane && pane.attrs.state?.startsWith("frozen") ? Math.min(Number(pane.attrs.ySplit) || 0, 10) : 0;

  const rows: (XlsxCell | null)[][] = [];
  for (let r = 0; r < rowCount; r++) rows.push(Array.from({ length: columnCount }, (_, c) => grid[r]?.[c] ?? null));
  return { name, widths, heights, rows, frozenRows, truncated };
}

export async function readXlsx(source: Blob | ArrayBuffer | Uint8Array): Promise<XlsxSheet[]> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(source, { checkCRC32: false });
  const text = async (path: string) => archive.file(path)?.async("string");

  const workbookXml = await text("xl/workbook.xml");
  if (!workbookXml) throw new Error("Arquivo XLSX inválido: planilha não encontrada.");
  const workbook = child(parseXml(workbookXml), "workbook");
  const rels = new Map<string, string>();
  const relsXml = await text("xl/_rels/workbook.xml.rels");
  if (relsXml) for (const rel of kids(child(parseXml(relsXml), "Relationships"), "Relationship")) rels.set(rel.attrs.Id, resolvePath("xl/workbook.xml", rel.attrs.Target ?? ""));

  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = sharedXml ? kids(child(parseXml(sharedXml), "sst"), "si").map(plainText) : [];
  const styles = readStyles(await text("xl/styles.xml"));
  const date1904 = child(workbook, "workbookPr")?.attrs.date1904 === "1";

  const sheets: XlsxSheet[] = [];
  for (const entry of kids(child(workbook, "sheets"), "sheet").slice(0, XLSX_LIMITS.sheets)) {
    if (entry.attrs.state === "hidden" || entry.attrs.state === "veryHidden") continue;
    const xml = await text(rels.get(entry.attrs.id ?? "") ?? "");
    if (xml) sheets.push(parseSheet(xml, entry.attrs.name ?? `Planilha ${sheets.length + 1}`, shared, styles, date1904));
  }
  if (!sheets.length) throw new Error("A planilha não contém abas visíveis.");
  return sheets;
}
