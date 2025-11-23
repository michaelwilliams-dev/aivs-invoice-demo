// ISO Timestamp: 2025-11-23T17:05:00Z
/**
 * docling_extract.js – AIVS Invoice Extractor (FREE · LOCAL)
 */

import { readFile } from "fs/promises";
import { PdfReader } from "@docling/document-model/pdf";
import { DocumentAnalyzer } from "@docling/analysis";
import { JsonExporter } from "@docling/export-json";

export async function extractInvoice(pdfPath) {
  try {
    const pdfBytes = await readFile(pdfPath);
    const reader = new PdfReader(pdfBytes);
    const model = await reader.extract();

    const analyzer = new DocumentAnalyzer();
    const analysed = analyzer.analyze(model);

    const exporter = new JsonExporter();
    const json = exporter.export(analysed);

    return json;
  } catch (err) {
    console.error("❌ Docling extraction:", err);
    return null;
  }
}
