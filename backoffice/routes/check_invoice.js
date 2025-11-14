/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T09:00:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 */

import express from "express";
import fileUpload from "express-fileupload";

import { parseInvoice, analyseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

/* -------------------------------------------------------------
   FAISS IMPORT (from project root)
------------------------------------------------------------- */
import { loadIndex, searchIndex } from "../../vector_store.js";

let faissIndex = null;

/* -------------------------------------------------------------
   PRELOAD FAISS (Same method as Accounting Assistant Pro)
------------------------------------------------------------- */
(async () => {
  try {
    console.log("📦 Preloading FAISS index…");
    faissIndex = await loadIndex(10000);
    console.log(`✅ FAISS ready: ${faissIndex.length} vectors`);
  } catch (err) {
    console.error("❌ Failed to load FAISS index:", err.message);
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
   MAIN ROUTE — FAISS ENABLED + FULLY WORKING
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

    const parsed = await parseInvoice(file.data);

    /* ---------------------------------------------------------
       FAISS SEARCH (ACCOUNTING-PRO METHOD)
    --------------------------------------------------------- */
    let faissContext = "";
    try {
      console.log("🔎 Running FAISS search…");

      const matches = await searchIndex(parsed.text, faissIndex);
      const filtered = matches.filter((m) => m.score >= 0.03);

      console.log("📌 FAISS chunks returned:", filtered.length);

      faissContext = filtered.map((m) => m.text).join("\n\n");
    } catch (err) {
      console.log("⚠️ FAISS search error:", err.message);
    }

    /* ---------------------------------------------------------
       ANALYSIS
    --------------------------------------------------------- */
    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    /* ---------------------------------------------------------
       REPORT + EMAIL
    --------------------------------------------------------- */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    const to = req.body.userEmail;
    const ccList = [req.body.emailCopy1, req.body.emailCopy2];

    await sendReportEmail(to, ccList, docPath, pdfPath, timestamp);

    /* ---------------------------------------------------------
       RESPONSE
    --------------------------------------------------------- */
    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      faissChunks: faissContext.length,
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
