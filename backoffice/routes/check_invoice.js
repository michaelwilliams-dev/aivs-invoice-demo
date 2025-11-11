/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-09T18:45:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 *
 * Description:
 * Handles file uploads and passes them to the AIVS invoice compliance
 * analysis functions. Supports CIS and VAT (DRC/zero-rated) logic.
 */

import express from "express";
import fileUpload from "express-fileupload";

/* ▼▼▼  CHANGE START — added import to reconnect full analysis loop  ▼▼▼ */
import { parseInvoice, analyseInvoice } from "../invoice_tools.js";
/* ▲▲▲  CHANGE END   — added import to reconnect full analysis loop  ▲▲▲ */

/* ▼▼▼  CHANGE START — import helpers for report + email  ▼▼▼ */
import { saveReportFiles, sendReportEmail } from "../../server.js";
/* ▲▲▲  CHANGE END   — import helpers for report + email  ▲▲▲ */

const router = express.Router();
router.use(fileUpload());

router.post("/check_invoice", async (req, res) => {
  try {
    console.log("🟢 /check_invoice endpoint hit", req.files);
    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;
    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate
    };

    /* ▼▼▼  CHANGE START — replaced placeholder with real analysis  ▼▼▼ */
    const parsed = await parseInvoice(file.data);
    const aiReply = await analyseInvoice(parsed.text, flags);
    console.log("🧾 AI reply returned:", aiReply);  // ✅ added debug line
    /* ▲▲▲  CHANGE END   — replaced placeholder with real analysis  ▲▲▲ */

    /* ▼▼▼  CHANGE START — generate and email report  ▼▼▼ */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);
    const to = req.body.userEmail;
    const ccList = [req.body.emailCopy1, req.body.emailCopy2];
    await sendReportEmail(to, ccList, docPath, pdfPath, timestamp);
    /* ▲▲▲  CHANGE END   — generate and email report  ▲▲▲ */

    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ /check_invoice error:", err.message);
    res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
});

export default router;
