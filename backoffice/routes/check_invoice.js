/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T14:45:00Z
 * Author: AIVS Software Limited
 */

import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import { OpenAI } from "openai";

import { parseInvoice, analyseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_APIKEY || process.env.OPENAI_API_KEY,
});

/* -------------------------------------------------------------
   INLINE FAISS ENGINE — SAME AS ACCOUNTING PRO
   WITH TEXT MERGE + 10,000 LIMIT
------------------------------------------------------------- */

const INDEX_PATH = "/mnt/data/vector.index";
const META_PATH  = "/mnt/data/chunks_metadata.final.jsonl";
const LIMIT      = 10000; // << REQUIRED FIX

let metadata = [];
let faissIndex = [];

/* -------------------------------------------------------------
   LOAD METADATA (text only)
------------------------------------------------------------- */
try {
  console.log("🔍 Loading FAISS metadata...");
  metadata = fs
    .readFileSync(META_PATH, "utf8")
    .trim()
    .split("\n")
    .slice(0, LIMIT)                      // MATCH EXACT VECTOR COUNT
    .map((l) => JSON.parse(l));

  console.log("✅ Loaded metadata lines:", metadata.length);
} catch (err) {
  console.error("❌ Metadata load error:", err.message);
  metadata = [];
}

/* -------------------------------------------------------------
   CHUNK-SAFE VECTOR INDEX LOADER (LIMIT = 10k)
------------------------------------------------------------- */
async function loadIndex(limit = LIMIT) {
  console.log(`📦 Loading vector.index in chunks (limit ${limit})...`);

  const fd = await fs.promises.open(INDEX_PATH, "r");
  const stream = fd.createReadStream({ encoding: "utf8" });

  let buffer = "";
  const vectors = [];
  let processed = 0;

  for await (const chunk of stream) {
    buffer += chunk;
    const parts = buffer.split("},");
    buffer = parts.pop();

    for (const p of parts) {
      if (!p.includes('"embedding"')) continue;

      try {
        const obj = JSON.parse(p.endsWith("}") ? p : p + "}");

        // 🔥 FIX: MERGE TEXT FROM METADATA
        const meta = metadata[processed] || {};
        vectors.push({
          ...obj,
          text: meta.text || ""
        });

        processed++;
        if (processed % 2000 === 0) {
          console.log(`  → Loaded ${processed} vectors`);
        }

        if (vectors.length >= limit) {
          console.log("🛑 Vector limit hit:", limit);
          await fd.close();
          return vectors;
        }
      } catch {}
    }
  }

  await fd.close();
  console.log(`✅ Loaded ${vectors.length} vectors`);
  return vectors;
}

/* -------------------------------------------------------------
   PRELOAD VECTORS ON STARTUP
------------------------------------------------------------- */
(async () => {
  try {
    faissIndex = await loadIndex(LIMIT);
    console.log(`🟢 FAISS READY: ${faissIndex.length} vectors`);
  } catch (err) {
    console.error("❌ FAISS preload failed:", err.message);
  }
})();

/* -------------------------------------------------------------
   DOT PRODUCT (Accounting Pro uses this)
------------------------------------------------------------- */
function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/* -------------------------------------------------------------
   FAISS SEARCH (Accounting Pro’s method)
------------------------------------------------------------- */
async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  const resp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [query],
  });

  const q = resp.data[0].embedding;

  const scored = index.map((v) => ({
    ...v,
    score: dotProduct(q, v.embedding),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, 20);
}

/* ------------------------------------------------------------- */

router.use(
  fileUpload({
    parseNested: true,
    useTempFiles: false,
    preserveExtension: true,
  })
);

/* -------------------------------------------------------------
   MAIN ROUTE — FULL FAISS + CONTEXT
------------------------------------------------------------- */

router.post("/check_invoice", async (req, res) => {
  try {
    console.log("🟢 /check_invoice");

    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;

    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate,
    };

    const parsed = await parseInvoice(file.data);

    /* ---------- FAISS SEARCH ---------- */
    let faissContext = "";
    let matches = [];

    try {
      console.log("🔎 Running FAISS search…");

      matches = await searchIndex(parsed.text, faissIndex);

      console.log("📌 Raw FAISS matches:", matches.length);
      console.log(
        "📌 First preview:",
        matches[0]?.text?.slice(0, 200) || "NONE"
      );

      const filtered = matches.filter((m) => m.score >= 0.03);

      console.log("📦 Relevant chunks:", filtered.length);

      faissContext = filtered.map((m) => m.text).join("\n\n");

    } catch (err) {
      console.log("⚠️ FAISS error:", err.message);
    }

    /* ---------- AI ANALYSIS ---------- */
    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    /* ---------- REPORT GENERATION ---------- */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    /* ---------- EMAIL ---------- */
    await sendReportEmail(
      req.body.userEmail,
      [req.body.emailCopy1, req.body.emailCopy2].filter(Boolean),
      docPath,
      pdfPath,
      timestamp
    );

    /* ---------- RESPONSE ---------- */
    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      faissMatches: matches.length,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("❌ /check_invoice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
