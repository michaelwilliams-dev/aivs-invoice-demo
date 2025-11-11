/**
 * AIVS Invoice Compliance Checker · Email Sender Route
 * ISO Timestamp: 2025-11-11T18:00:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 *
 * Description:
 * Handles post-upload email sending of generated reports via Mailjet.
 */
import express from "express";
import { sendReportEmail } from "../../server.js";

const router = express.Router();

router.post("/send_email", async (req, res) => {
  try {
    const { userEmail, emailCopy1, emailCopy2 } = req.body;
    console.log("📨 Manual email send request:", userEmail, emailCopy1, emailCopy2);

    // paths of last generated report
    const docPath = "/opt/render/project/src/generated/latest.docx";
    const pdfPath = "/opt/render/project/src/generated/latest_raw.pdf";
    const timestamp = new Date().toISOString();

    await sendReportEmail(userEmail, [emailCopy1, emailCopy2], docPath, pdfPath, timestamp);
    res.json({ status: "email_sent", timestamp });
  } catch (err) {
    console.error("❌ /send_email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
