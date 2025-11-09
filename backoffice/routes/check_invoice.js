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
import { parseInvoice, analyseInvoice } from "../invoice_tools.js";

const router = express.Router();
router.use(fileUpload());

// Main route for invoice compliance checks
router.post("/check_invoice", async (req, res) => {
  try {
    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;
    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate
    };

    const parsed = await parseInvoice(file.data);
    const aiReply = await analyseInvoice(parsed.text, flags);

    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;