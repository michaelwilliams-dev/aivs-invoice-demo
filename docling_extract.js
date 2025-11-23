// ISO Timestamp: 2025-11-23T16:50:00Z
/**
 * docling_extract.js
 * AIVS Invoice Extractor using Docling
 * Reads ANY PDF invoice and outputs structured JSON
 * Fully local and free
 */

import { readFile } from "fs/promises";
import { PdfReader } from "@docling/document-model/pdf";
import { DocumentAnalyzer } from "@docling/analysis";
import { JsonExporter } from "@docling/export-json";

/* ----------------------------------------------------------
   MAIN EXTRACTION FUNCTION
----------------------------------------------------------- */

export async function extractInvoice(pdfPath) {
  try {
    // 1. Load PDF bytes
    const pdfBytes = await readFile(pdfPath);

    // 2. Create Docling reader
    const reader = new PdfReader(pdfBytes);

    // 3. Extract Docling’s internal document model
    const documentModel = await reader.extract();

    // 4. Run document analysis (tables, blocks, line-items)
    const analyzer = new DocumentAnalyzer();
    const analysedModel = analyzer.analyze(documentModel);

    // 5. Export as JSON
    const exporter = new JsonExporter();
    const json = exporter.export(analysedModel);

    return json;

  } catch (err) {
    console.error("❌ Docling extraction failed:", err);
    return null;
  }
}

/* ----------------------------------------------------------
   OPTIONAL CLI RUNNER
   Allows:  node docling_extract.js invoice.pdf
----------------------------------------------------------- */

if (process.argv[2]) {
  const file = process.argv[2];
  extractInvoice(file).then((json) => {
    console.log(JSON.stringify(json, null, 2));
  });
}
