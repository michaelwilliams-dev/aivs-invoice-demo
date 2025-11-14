/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T13:00:00Z
 * Author: AIVS Software Limited
 */

import express from "express";
import fileUpload from "express-fileupload";

import { parseInvoice, analyseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

/* -------------------------------------------------------------
   USE YOUR ACTUAL, WORKING FAISS ENGINE
------------------------------------------------------------- */
import { loadIndex, searchIndex } from "../../vector_store.js";

let faissIndex = [];

/* -------------------------------------------------------------
   PRELOAD FAISS (same as Accounting PRO)
------------------------------------------------------------- */
(async () => {
  try {
    console.log("📦 Loading FAISS (chunk-safe) index…");
    faissIndex = await loadIndex(50000);
    console.log(`✅ Loaded ${faissIndex.length} FAISS vectors`);
  } catch (err) {
    console.error("❌ Failed to preload FAISS:", err.message);
    faissIndex = [];
  }
})();

/* ------------------------------------------------------------- */

const router = express.Router();

router.use(
  fileUpload({
    parseNested: true,
    useTempFiles: false,
    preserveExtension: true,
  })
);

/* -------------------------------------------------------------
   MAIN ROUTE — FULL FAISS + invoice analysis
------------------------------------------------------------- */
router.post("/check_invoice", async (req, res) => {
  try {
    console.log("🟢 /check_invoice");

    if (!req.files?.file) throw new Error("No file uploaded.");

    const file = req.files.file;

    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate,
    };

    /* Parse invoice */
    const parsed = await parseInvoice(file.data);

    /* === FAISS SEARCH (YOUR WORKING VERSION) === */
    let faissContext = "";
    let matches = [];

    try {
      console.log("🔎 Running FAISS search…");
      matches = await searchIndex(parsed.text, faissIndex);

      console.log("📌 FAISS top matches:", matches.length);
      console.log("📌 First match preview:", matches[0]?.text?.slice(0, 150) || "NONE");

      const filtered = matches.filter((m) => m.score >= 0.03);
      faissContext = filtered.map((m) => m.text).join("\n\n");

    } catch (err) {
      console.log("⚠️ FAISS error:", err.message);
    }

    /* AI analysis */
    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    /* Report files */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    /* Email */
    const to = req.body.userEmail;
    const ccList = [req.body.emailCopy1, req.body.emailCopy2].filter(Boolean);

    await sendReportEmail(to, ccList, docPath, pdfPath, timestamp);

    /* Response */
    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      faissMatches: matches.length,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("❌ /check_invoice error:", err.message);
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
