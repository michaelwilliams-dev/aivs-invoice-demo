/**
 * AIVS CIS/VAT Invoice Checker – Clean Multi-Line Version
 * Stable, safe, table-only parsing
 * Author: AIVS Software Limited
 */

import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import { OpenAI } from "openai";

import { parseInvoice } from "../invoice_tools.js";
import { saveReportFiles, sendReportEmail } from "../../server.js";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY });

/* -------------------------------------------------------------
   HELPERS
------------------------------------------------------------- */

// Normalise numbers including negatives & bracketed
function toNumber(v) {
  if (!v) return 0;
  return parseFloat(v.replace(/[(),]/g, "").replace(/,/g, ""));
}

// Identify table block ONLY (ignore header, address, VAT number, phone)
function extractTable(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Find first line that looks like a real table header
  const headerIndex = lines.findIndex(l =>
    /(description|quantity|qty).*?(unit|price|amount|vat)/i.test(l)
  );

  if (headerIndex === -1) return [];

  // Return only lines AFTER the header
  return lines.slice(headerIndex + 1);
}

// Identify labour for CIS
function isLabour(desc) {
  const s = desc.toLowerCase();
  return (
    s.includes("labour") ||
    s.includes("day") ||
    s.includes("hrs") ||
    s.includes("hr") ||
    s.includes("joinery") ||
    s.includes("installation") ||
    s.includes("carpentry")
  );
}

// Structural validation
function validStructure(subtotal, vat, gross) {
  if (subtotal <= 0) return false;
  if (gross <= 0) return false;
  if (gross < subtotal) return false;
  return true;
}

/* -------------------------------------------------------------
   MAIN ROUTE
------------------------------------------------------------- */

router.use(fileUpload({ parseNested: true }));

router.post("/check_invoice", async (req, res) => {
  try {
    if (!req.files?.file) throw new Error("No file uploaded");

    const file = req.files.file;
    const parsed = await parseInvoice(file.data);
    const raw = parsed.text || "";

    /* STEP 1 — Extract invoice table only */
    const table = extractTable(raw);
    if (!table.length) {
      return res.json({
        aiReply: {
          vat_check: "Unable to determine VAT.",
          cis_check: "Unable to determine CIS.",
          required_wording: "N/A",
          summary: "Invoice has no identifiable table. Upload a clearer PDF.",
          corrected_invoice: null
        }
      });
    }

    /* STEP 2 — Parse each table line */
    const items = [];

    for (const line of table) {
      // Stop when the table ends (encounters Subtotal)
      if (/subtotal/i.test(line)) break;

      const parts = line.split(/\s+/);

      // Extract description text (anything before numbers)
      const match = line.match(/^(.*?)(\d[\d.,()]*\s+\(?[\d.,()]+\)?)/);
      const description = match ? match[1].trim() : line;

      // Extract quantity
      const qtyMatch = line.match(/(\d+(\.\d+)?)/);
      if (!qtyMatch) continue;
      const qty = parseFloat(qtyMatch[1]);

      // Extract unit price
      const unitMatch = line.match(/(-?\(?\d[\d,]*\.?\d*\)?)/g);
      if (!unitMatch || unitMatch.length < 2) continue;
      const unit = toNumber(unitMatch[1]);

      // VAT rate
      const vatMatch = line.match(/(\d+)%|no vat|0%/i);
      const vatRate = vatMatch
        ? vatMatch[1]
          ? parseFloat(vatMatch[1])
          : 0
        : 20; // default

      // VAT amount if present
      let vatAmount = 0;
      const vatAmtMatch = line.match(/\(?\d[\d,]*\.\d+\)?$/);
      if (vatAmtMatch) vatAmount = toNumber(vatAmtMatch[0]);

      const lineTotal = qty * unit;

      items.push({
        description,
        qty,
        unit,
        vatRate,
        vatAmount,
        lineTotal
      });

      if (items.length >= 10) break;
    }

    /* STEP 3 — Compute totals */
    let subtotal = 0;
    let vatFromLines = 0;

    for (const i of items) {
      subtotal += i.lineTotal;
      vatFromLines += i.vatAmount || (i.lineTotal * (i.vatRate / 100));
    }

    const gross = subtotal + vatFromLines;

    /* STEP 4 — CIS logic */
    let labourBase = 0;
    for (const i of items) {
      if (isLabour(i.description)) labourBase += i.lineTotal;
    }
    const cis = +(labourBase * 0.20).toFixed(2);

    /* STEP 5 — DRC logic */
    const drc = raw.toLowerCase().includes("reverse") ||
                raw.toLowerCase().includes("drc");

    /* STEP 6 — Validation */
    const safe = validStructure(subtotal, vatFromLines, gross);

    /* ALWAYS RETURN SUMMARY */
    const reply = {
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
      summary: safe
        ? `Corrected: Net £${subtotal.toFixed(2)}, CIS £${cis.toFixed(
            2
          )}, Total Due £${(gross - cis).toFixed(2)}`
        : "Invoice reviewed. Data incomplete — no corrected invoice preview generated.",
      corrected_invoice: null
    };

    /* IF SAFE → RETURN PREVIEW */
    if (safe) {
      reply.corrected_invoice = `
      <div style="font-family:Arial; font-size:14px;">
        <h3 style="color:#4e65ac">Corrected Invoice</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit (£)</th>
            <th>VAT Rate</th>
            <th>VAT (£)</th>
            <th>Line Total (£)</th>
          </tr>
          ${items
            .map(
              (i) => `
            <tr>
              <td>${i.description}</td>
              <td style="text-align:right">${i.qty}</td>
              <td style="text-align:right">${i.unit.toFixed(2)}</td>
              <td style="text-align:right">${i.vatRate}%</td>
              <td style="text-align:right">${i.vatAmount.toFixed(2)}</td>
              <td style="text-align:right">${i.lineTotal.toFixed(2)}</td>
            </tr>`
            )
            .join("")}
          <tr><td colspan="5" style="text-align:right"><b>Subtotal</b></td>
              <td style="text-align:right"><b>${subtotal.toFixed(2)}</b></td></tr>
          <tr><td colspan="5" style="text-align:right"><b>VAT</b></td>
              <td style="text-align:right">${vatFromLines.toFixed(2)}</td></tr>
          <tr><td colspan="5" style="text-align:right"><b>CIS (20%)</b></td>
              <td style="text-align:right">-${cis.toFixed(2)}</td></tr>
          <tr><td colspan="5" style="text-align:right;background:#eef2ff"><b>Total Due</b></td>
              <td style="text-align:right;background:#eef2ff"><b>${(gross - cis).toFixed(2)}</b></td></tr>
        </table>
      </div>
      `;
    }

    /* SAVE OUTPUT */
    const { docPath, pdfPath, timestamp } = await saveReportFiles(reply);

    await sendReportEmail(
      req.body.userEmail,
      [req.body.emailCopy1, req.body.emailCopy2].filter(Boolean),
      reply,
      docPath,
      pdfPath,
      timestamp
    );

    return res.json({ aiReply: reply });

  } catch (err) {
    console.error("❌ Checker Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
