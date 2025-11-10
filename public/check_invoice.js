/**
 * AIVS Invoice Compliance Checker · Backend Route (Original express-fileupload version)
 * ISO Timestamp: 2025-11-10T16:15:00Z
 * Author: AIVS Software Limited
 */

import express from "express";
import fileUpload from "express-fileupload";

const router = express.Router();

// enable file upload middleware
router.use(fileUpload());

// POST /check_invoice
router.post("/check_invoice", async (req, res) => {
  try {
    const file = req.files ? req.files.file : null;
    console.log("📄 File received:", file?.name);
    console.log("VAT Category:", req.body.vatCategory);
    console.log("End User Confirmed:", req.body.endUserConfirmed);
    console.log("CIS Rate:", req.body.cisRate);

    res.json({
      parserNote: "Invoice upload received successfully.",
      aiReply: {
        vat_check: "Reverse charge correctly applied.",
        cis_check: "CIS deduction required at 20%.",
        required_wording:
          "Include 'Customer to account for VAT under the reverse charge'.",
        corrected_invoice: "<p>Example corrected invoice preview.</p>",
        summary: "Invoice appears compliant under CIS and DRC rules."
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Error in /check_invoice:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
