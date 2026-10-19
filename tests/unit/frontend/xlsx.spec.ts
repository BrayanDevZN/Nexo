// Tests live outside the frontend package, so resolve its dependency explicitly.
import JSZip from "../../../src/frontend/node_modules/jszip";
import { test, expect } from "../../../src/frontend/test-kit";
import { parseXml, readXlsx, columnIndex } from "../../../src/frontend/admin/xlsxReader";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

async function workbook(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
}

const base = (sheet: string, extra: Record<string, string> = {}) => ({
  "xl/workbook.xml": `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Oculta" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
  "xl/worksheets/sheet1.xml": sheet,
  "xl/worksheets/sheet2.xml": `<worksheet ${NS}><sheetData/></worksheet>`,
  ...extra,
});

test("parses XML with entities, CDATA and namespaces", () => {
  const root = parseXml('<?xml version="1.0"?><x:a xmlns:x="u" k="1 &amp; 2"><x:b>R&amp;D &#233;</x:b><c><![CDATA[<raw>]]></c></x:a>');
  const a = root.children[0];
  expect(a.name).toBe("a");
  expect(a.attrs.k).toBe("1 & 2");
  expect(a.children[0].text).toBe("R&D é");
  expect(a.children[1].text).toBe("<raw>");
  expect(columnIndex("AB7")).toBe(27);
});

test("reads values, formats, styles, merges and frozen rows from an xlsx", async () => {
  const data = await workbook(base(
    `<worksheet ${NS}><sheetViews><sheetView><pane ySplit="2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/></cols><sheetData>
      <row r="1" ht="30"><c r="A1" s="1" t="s"><v>0</v></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Cliente</t></is></c><c r="B2" t="inlineStr"><is><t>Valor</t></is></c><c r="C2"><v>45292.5</v></c></row>
      <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="2"><v>1234.5</v></c><c r="C3" s="3"><v>0.256</v></c><c r="D3" t="b"><v>1</v></c></row>
    </sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
    {
      "xl/sharedStrings.xml": `<sst ${NS}><si><t>Relatório</t></si><si><r><t>Ana </t></r><r><t>&amp; Cia</t></r></si></sst>`,
      "xl/styles.xml": `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
        <fonts count="2"><font><sz val="11"/></font><font><b/><color rgb="FFFFFFFF"/></font></fonts>
        <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6D4AFF"/></patternFill></fill></fills>
        <borders count="1"><border/></borders>
        <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`,
    },
  ));
  const sheets = await readXlsx(data);
  expect(sheets.map(sheet => sheet.name)).toEqual(["Resumo"]);
  const [sheet] = sheets;
  expect(sheet.frozenRows).toBe(2);
  expect(sheet.widths[0]).toBe(158);
  expect(sheet.heights[0]).toBe(40);
  expect(sheet.rows[0][0]).toMatchObject({ text: "Relatório", colSpan: 3, rowSpan: 1, style: { bold: true, color: "#FFFFFF", background: "#6D4AFF", align: "center" } });
  expect(sheet.rows[0][1]).toBeNull();
  expect(sheet.rows[1].map(cell => cell?.text)).toEqual(["Cliente", "Valor", "45292,5", undefined]);
  expect(sheet.rows[2][0]?.text).toBe("Ana & Cia");
  expect(sheet.rows[2][1]).toMatchObject({ text: "R$ 1.234,50", numeric: true });
  expect(sheet.rows[2][2]?.text).toBe("25,60%");
  expect(sheet.rows[2][3]?.text).toBe("VERDADEIRO");
});

test("formats dates and times and limits very large sheets", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" s="1"><v>${45292 + i}</v></c></row>`).join("");
  const data = await workbook(base(`<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`, {
    "xl/styles.xml": `<styleSheet ${NS}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  }));
  const [sheet] = await readXlsx(data);
  expect(sheet.rows).toHaveLength(1000);
  expect(sheet.truncated).toBe(true);
  expect(sheet.rows[0][0]?.text).toBe("01/01/2024");
  expect(sheet.rows[31][0]?.text).toBe("01/02/2024");
});

test("rejects files that are not workbooks", async () => {
  await expect(readXlsx(await workbook({ "readme.txt": "oi" }))).rejects.toThrow(/inválido/);
  await expect(readXlsx(new Uint8Array([1, 2, 3]))).rejects.toThrow();
});
