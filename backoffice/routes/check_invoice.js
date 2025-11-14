/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T15:20:00Z
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
   INLINE FAISS ENGINE — FIXED METADATA ALIGNMENT
------------------------------------------------------------- */

const INDEX_PATH = "/mnt/data/vector.index";
const META_PATH  = "/mnt/data/chunks_metadata.final.jsonl";
const LIMIT      = 10000;

let metadata = [];
let faissIndex = [];

/* -------------------------------------------------------------
   LOAD METADATA (text lines)
------------------------------------------------------------- */
try {
  console.log("🔍 Loading FAISS metadata...");
  metadata = fs
    .readFileSync(META_PATH, "utf8")
    .trim()
    .split("\n")
    .slice(0, LIMIT)
    .map((l) => JSON.parse(l));

  console.log("✅ Loaded metadata:", metadata.length);
} catch (err) {
  console.error("❌ Metadata load error:", err.message);
  metadata = [];
}

/* -------------------------------------------------------------
   CHUNK-SAFE VECTOR LOADER WITH BI-DIRECTIONAL TEXT ALIGNMENT
------------------------------------------------------------- */
async function loadIndex(limit = LIMIT) {
  console.log(`📦 Loading vector.index in chunks (limit ${limit})`);

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

        /* -----------------------------------------------------
           🔥 FIX: BI-DIRECTIONAL METADATA SEARCH
           Finds the NEAREST non-empty text line for each vector
        ------------------------------------------------------*/
        let meta = metadata[processed] || {};
        let forward = processed + 1;
        let backward = processed - 1;

        // SEARCH FORWARD
        while ((!meta.text || meta.text.trim() === "") && forward < metadata.length) {
          if (metadata[forward].text && metadata[forward].text.trim() !== "") {
            meta = metadata[forward];
            break;
          }
          forward++;
        }

        // IF STILL EMPTY → SEARCH BACKWARD
        if (!meta.text || meta.text.trim() === "") {
          while (backward >= 0) {
            if (metadata[backward].text && metadata[backward].text.trim() !== "") {
              meta = metadata[backward];
              break;
            }
            backward--;
          }
        }

        vectors.push({
          ...obj,
          text: meta.text || "[NO CONTEXT AVAILABLE]"
        });

        processed++;

        if (vectors.length >= limit) {
          console.log(`🛑 Vector limit reached (${limit})`);
          await fd.close();
          return vectors;
        }

      } catch {}
    }
  }

  await fd.close();
  console.log(`✅ Loaded vectors: ${vectors.length}`);
  return vectors;
}

/* -------------------------------------------------------------
   PRELOAD INDEX
------------------------------------------------------------- */
(async () => {
  try {
    faissIndex = await loadIndex(LIMIT);
    console.log(`🟢 FAISS READY (${faissIndex.length} vectors)`);
  } catch (err) {
    console.error("❌ FAISS preload failed:", err.message);
  }
})();

/* -------------------------------------------------------------
   DOT PRODUCT (Accounting Pro)
------------------------------------------------------------- */
function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/* -------------------------------------------------------------
   FAISS SEARCH (Accounting Pro)
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

/* -------------------------------------------------------------
   MAIN INVOICE CHECK ROUTE
------------------------------------------------------------- */

router.use(
  fileUpload({
    parseNested: true,
    useTempFiles: false,
    preserveExtension: true,
  })
);

router.post("/check_invoice", async (req, res) => {
  try {
    console.log("🟢 /check_invoice");

    if (!req.files?.file) throw new Error("No file uploaded.");

    const file = req.files.file;

    const flags = {
    vatCategory: req.body.vatCategory,
    endUserConfirmed: req.body.endUserConfirmed,
    cisRate: req.body.cisRate,
    labour: req.body.labour,
    materials: req.body.materials,
  };

    const parsed = await parseInvoice(file.data);

    /* --- FAISS SEARCH --- */
    let faissContext = "";
    let matches = [];

    try {
      console.log("🔎 Running FAISS search...");
      matches = await searchIndex(parsed.text, faissIndex);

      console.log("📌 Raw matches:", matches.length);
      console.log("📌 Preview:", matches[0]?.text?.slice(0, 200) || "NONE");

      const filtered = matches.filter((m) => m.score >= 0.03);

      console.log("📦 Relevant chunks:", filtered.length);

      faissContext = filtered.map((m) => m.text).join("\n\n");

    } catch (err) {
      console.error("⚠️ FAISS search error:", err.message);
    }

    /* --- AI Analysis --- */
    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    /* --- REPORT --- */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    /* --- EMAIL --- */
    await sendReportEmail(
      req.body.userEmail,
      [req.body.emailCopy1, req.body.emailCopy2].filter(Boolean),
      docPath,
      pdfPath,
      timestamp
    );

    /* --- RESPONSE --- */
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

/* -------------------------------------------------------------
   FAISS TEST ROUTE
------------------------------------------------------------- */
router.get("/faiss-test", async (req, res) => {
  try {
    const q = "CIS deduction VAT reverse charge";

    const matches = await searchIndex(q, faissIndex);
    const top = matches[0] || {};

    res.json({
      ok: true,
      totalVectors: faissIndex.length,
      matches: matches.length,
      topScore: top.score || 0,
      preview: top.text ? top.text.slice(0, 250) : "NONE",
    });

  } catch (err) {
    res.json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
