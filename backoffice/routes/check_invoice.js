/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T09:00:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 *
 * Description:
 * Handles file uploads and passes them to the AIVS invoice compliance
 * analysis functions. Supports CIS and VAT (DRC/zero-rated) logic.
 */

import express from "express";
import fileUpload from "express-fileupload";

/* Existing Analysis Imports */
import { parseInvoice, analyseInvoice } from "../invoice_tools.js";

/* Report + Email Imports */
import { saveReportFiles, sendReportEmail } from "../../server.js";

/* -------------------------------------------------------------
   FAISS + OpenAI Embedding Loader (NO OTHER CHANGES)
------------------------------------------------------------- */
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Hard paths to your duplicated FAISS index on Invoice Checker Render disk
const INDEX_PATH = "/mnt/data/vector.index";
const META_PATH = "/mnt/data/chunks_metadata.final.jsonl";

/* Load FAISS metadata once */
console.log("🔍 Loading FAISS index for Invoice Checker…");

if (!fs.existsSync(INDEX_PATH)) {
  console.error("❌ Missing vector.index in /mnt/data");
}
if (!fs.existsSync(META_PATH)) {
  console.error("❌ Missing chunks_metadata.final.jsonl in /mnt/data");
}

const metadata = fs
  .readFileSync(META_PATH, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

console.log("✅ FAISS metadata loaded. Chunks:", metadata.length);

/* --- Simple cosine similarity --- */
function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* --- FAISS Search Wrapper (no changes elsewhere) --- */
async function searchFaiss(queryText, topK = 6) {
  const emb = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: queryText,
  });

  const qVec = emb.data[0].embedding;

  const scored = metadata.map((m) => ({
    text: m.text,
    score: cosine(qVec, m.embedding),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

/* ------------------------------------------------------------- */

const router = express.Router();

// Enable invoice upload handling
router.use(
  fileUpload({
    parseNested: true,
    useTempFiles: false,
    preserveExtension: true,
  })
);

router.post("/check_invoice", async (req, res) => {
  try {
    console.log("🟢 /check_invoice endpoint hit", req.files);

    try {
      console.log("🧭 TRACE req.body:", JSON.stringify(req.body, null, 2));
    } catch {}

    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;

    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate,
    };

    // Parse invoice
    const parsed = await parseInvoice(file.data);

    // NEW — FAISS search
    console.log("🔎 Running FAISS search…");
    const faissHits = await searchFaiss(parsed.text, 6);
    console.log(
      "📌 FAISS top scores:",
      faissHits.map((h) => h.score.toFixed(3))
    );

    // Inject FAISS context into analysis
    const faissContext = faissHits.map((h) => h.text).join("\n\n");

    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    // Save Word + PDF
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    // Email send
    const to = req.body.userEmail;
    const ccList = [req.body.emailCopy1, req.body.emailCopy2];
    await sendReportEmail(to, ccList, docPath, pdfPath, timestamp);

    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      timestamp: new Date().toISOString(),
    });

    return;
  } catch (err) {
    console.error("❌ /check_invoice error:", err.message);
    res
      .status(500)
      .json({ error: err.message, timestamp: new Date().toISOString() });
    return;
  }
});

export default router;
