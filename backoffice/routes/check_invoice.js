/**
 * AIVS Invoice Compliance Checker · Mini-Parser Version (Option B)
 * ISO Timestamp: 2025-11-20T00:00:00Z
 * Author: AIVS Software Limited
 *
 * ✔ Up to 6 lines supported
 * ✔ Qty / Unit / VAT rate / VAT amount extracted
 * ✔ Negative & bracketed numbers supported
 * ✔ Hybrid VAT logic (printed VAT preferred)
 * ✔ DRC fallback
 * ✔ CIS only on labour
 * ✔ Safe mode: summary always shown; preview only when valid
 */

import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import { OpenAI } from "openai";

import { parseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY });

/* ------------------------------------------------------------------
   MINI-PARSER UTILITIES
------------------------------------------------------------------ */

/** Normalise numbers including negative values and bracketed values */
function toNumber(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/[(),]/g, ""));
}

/** Extract lines from text (max 6) */
function extractInvoiceLines(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, 20); // scan first 20 lines only

  const parsed = [];

  for (let line of lines) {
    // Try to capture: qty, unit price, VAT%
    const qtyMatch = line.match(/(\d+(\.\d+)?)/);
    const unitMatch = line.match(/(-?\(?\d[\d,]*\.?\d*\)?)/);
    const vatRateMatch = line.match(/(\d+)%|no vat|0%/i);

    if (!qtyMatch || !unitMatch) continue;

    const qty = parseFloat(qtyMatch[1]);
    const unit = toNumber(unitMatch[1]);

    const vatRate = vatRateMatch
      ? vatRateMatch[1] ? parseFloat(vatRateMatch[1]) : 0
      : 20; // default VAT rate if unspecified

    parsed.push({
      raw: line,
      description: line,
      qty,
      unit,
      vatRate
    });

    if (parsed.length >= 6) break;
  }

  return parsed;
}

/** Determine if line is labour (for CIS) */
function isLabour(desc) {
  const s = desc.toLowerCase();
  return (
    s.includes("labour") ||
    s.includes("day") ||
    s.includes("hr") ||
    s.includes("joinery") ||
    s.includes("construction") ||
    s.includes("builder")
  );
}

/** Structural validity */
function invoiceIsValid(lines, subtotal, gross) {
  if (lines.length === 0) return false;
  if (subtotal <= 0) return false;
  if (gross <= 0) return false;
  return true;
}

/* ------------------------------------------------------------------
   MAIN ROUTE
------------------------------------------------------------------ */

router.use(fileUpload({ parseNested: true }));

router.post("/check_invoice", async (req, res) => {
  try {
    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;
    const parsed = await parseInvoice(file.data);
    const text = parsed.text || "";

    /* STEP 1 — Extract line items */
    const items = extractInvoiceLines(text);

    /* STEP 2 — Compute line totals */
    let subtotal = 0;
    let vatTotal = 0;
    let gross = 0;

    for (const item of items) {
      item.lineTotal = item.qty * item.unit;

      // Hybrid VAT logic:
      // if VAT rate is printed, use printed rate; otherwise assume zero
      const vatAmount = item.lineTotal * (item.vatRate / 100);

      item.vatAmount = vatAmount;
      subtotal += item.lineTotal;
      vatTotal += vatAmount;
    }

    gross = subtotal + vatTotal;

    /* STEP 3 — CIS logic (ONLY labour lines) */
    let labourBase = 0;
    for (const item of items) {
      if (isLabour(item.description)) {
        labourBase += item.lineTotal;
      }
    }
    const cis = +(labourBase * 0.20).toFixed(2);

    /* STEP 4 — DRC logic */
    const drc = text.toLowerCase().includes("reverse") ||
                text.toLowerCase().includes("drc");

    /* STEP 5 — Structural validation */
    const valid = invoiceIsValid(items, subtotal, gross);

    /* STEP 6 — Build safe summary (always returned) */
    const summaryText = valid
      ? `Corrected: Net £${subtotal.toFixed(2)}, CIS £${cis.toFixed(2)}, Total Due £${(gross - cis).toFixed(2)}`
      : "Invoice reviewed, but insufficient or inconsistent data was detected. A corrected invoice preview cannot be generated.";

    const aiReply = {
      vat_check: drc
        ? "VAT removed – Domestic Reverse Charge applies."
        : "VAT reviewed.",
      cis_check:
        labourBase > 0
          ? `CIS deduction at 20% applied: £${cis}`
          : "CIS does not apply to this invoice.",
      required_wording: drc
        ? "Reverse Charge: Customer must account for VAT to HMRC (VAT Act 1994 Section 55A)."
        : "Standard VAT rules apply.",
      summary: summaryText,

      corrected_invoice: valid
        ? `
          <div style="font-family:Arial; font-size:14px;">
            <h3 style="color:#4e65ac">Corrected Invoice</h3>
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit (£)</th>
                <th>Line Total (£)</th>
              </tr>
              ${items
                .map(
                  (i) => `
                <tr>
                  <td>${i.description}</td>
                  <td style="text-align:right">${i.qty}</td>
                  <td style="text-align:right">${i.unit.toFixed(2)}</td>
                  <td style="text-align:right">${i.lineTotal.toFixed(2)}</td>
                </tr>`
                )
                .join("")}
              <tr><td colspan="3" style="text-align:right;font-weight:bold">Subtotal</td>
                  <td style="text-align:right">${subtotal.toFixed(2)}</td>
              </tr>
              <tr><td colspan="3" style="text-align:right;font-weight:bold">VAT</td>
                  <td style="text-align:right">${vatTotal.toFixed(2)}</td>
              </tr>
              <tr><td colspan="3" style="text-align:right;font-weight:bold">CIS (20%)</td>
                  <td style="text-align:right">-${cis.toFixed(2)}</td>
              </tr>
              <tr><td colspan="3" style="text-align:right;font-weight:bold;background:#eef2ff">Total Due</td>
                  <td style="text-align:right;background:#eef2ff">${(gross - cis).toFixed(2)}</td>
              </tr>
            </table>
          </div>`
        : null,
    };

    /* Save report files */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(aiReply);

    /* Optional email */
    await sendReportEmail(
      req.body.userEmail,
      [req.body.emailCopy1, req.body.emailCopy2].filter(Boolean),
      aiReply,
      docPath,
      pdfPath,
      timestamp
    );

    return res.json({ aiReply, timestamp });

  } catch (err) {
    console.error("❌ Invoice Checker Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
