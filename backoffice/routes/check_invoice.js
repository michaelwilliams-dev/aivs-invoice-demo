/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T13:00:00Z
 * Author: AIVS Software Limited
 */

import express from "express";
import fileUpload from "express-fileupload";

import { parseInvoice, analyseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

const router = express.Router();

/* -------------------------------------------------------------
   REMOVE vector_store.js — FAISS DISABLED TEMPORARILY
   (We will re-enable once deployment is stable)
------------------------------------------------------------- */

let faissIndex = [];

/* ------------------------------------------------------------- */
/*  MAIN ROUTE — NO vector_store.js REFERENCE                    */
/* ------------------------------------------------------------- */

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
    };

    const parsed = await parseInvoice(file.data);

    /* ---------------------------------------------------------
       FAISS TEMPORARILY DISABLED UNTIL DEPLOY IS STABLE
    --------------------------------------------------------- */
    const faissContext = "";
    const matches = [];

    /* Invoice Analysis */
    const aiReply = await analyseInvoice(parsed.text, flags, faissContext);

    /* Report */
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
