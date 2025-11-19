/**
 * AIVS Invoice Compliance Checker · Express Route
 * ISO Timestamp: 2025-11-14T16:30:00Z
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
   FAISS (Relevance Only — No Text Required)
------------------------------------------------------------- */

const INDEX_PATH = "/mnt/data/vector.index";
const META_PATH  = "/mnt/data/chunks_metadata.final.jsonl";
const LIMIT      = 10000;

let metadata = [];
let faissIndex = [];

/* Load metadata */
try {
  console.log("🔍 Loading FAISS metadata...");
  metadata = fs
    .readFileSync(META_PATH, "utf8")
    .trim()
    .split("\n")
    .slice(0, LIMIT)
    .map((l) => JSON.parse(l));

  console.log("✅ Loaded metadata lines:", metadata.length);
} catch (err) {
  console.error("❌ Metadata load error:", err.message);
  metadata = [];
}

/* Load vector.index */
async function loadIndex(limit = LIMIT) {
  console.log(`📦 Loading vector.index (limit ${limit})`);

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
        const meta = metadata[processed] || {};

        vectors.push({ ...obj, meta });
        processed++;

        if (vectors.length >= limit) {
          console.log("🛑 Vector limit reached");
          await fd.close();
          return vectors;
        }
      } catch {}
    }
  }

  await fd.close();
  console.log(`✅ Loaded ${vectors.length} vectors`);
  return vectors;
}

/* Preload FAISS */
(async () => {
  try {
    faissIndex = await loadIndex(LIMIT);
    console.log(`🟢 FAISS READY (${faissIndex.length} vectors)`);
  } catch (err) {
    console.error("❌ FAISS preload failed:", err.message);
  }
})();

/* Dot product relevance */
function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/* Semantic search */
async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [query],
  });

  const q = emb.data[0].embedding;

  const scored = index.map((v) => ({
    ...v,
    score: dotProduct(q, v.embedding),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, 10);
}

/* -------------------------------------------------------------
   MAIN ROUTE
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

    if (!req.files?.file) throw new Error("No file uploaded");
    const file = req.files.file;

    const flags = {
      vatCategory: req.body.vatCategory,
      endUserConfirmed: req.body.endUserConfirmed,
      cisRate: req.body.cisRate
    };

    const parsed = await parseInvoice(file.data);
    console.log("📄 PARSED TEXT:", parsed.text);

    /* -------------------------------------------------------------
       DRC AUTO-CORRECTION + LINE EXTRACTION
------------------------------------------------------------- */

    function detectDRC(text) {
      if (!text) return false;
      const t = text.toLowerCase();

      return (
        (t.includes("labour") ||
         t.includes("carpentry") ||
         t.includes("construction") ||
         t.includes("builder") ||
         t.includes("joinery")) &&
        t.includes("vat") &&
        t.includes("20")
      );
    }

    function extractLineItem(text) {
      const t = text.replace(/\s+/g, " ").trim();

      const qtyMatch = t.match(/(\d+)\s*(day|days|hr|hrs|hour|hours)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      let description = "Invoice item";

      lines.forEach((line, i) => {
        if (qtyMatch && line.includes(qtyMatch[1])) {
          if (lines[i + 1]) description = lines[i + 1].trim();
        }
      });

      return { description, qty };
    }

    /* ---------- UPDATED correctDRC() ---------- */
    function correctDRC(text) {
      const item = extractLineItem(text);

      /* --------- FINAL ORDERED EXTRACTION BLOCK ---------- */

      function extractNumber(pattern, txt) {
        const m = txt.match(pattern);
        return m ? parseFloat(m[1].replace(/,/g, "")) : null;
      }

      let net = null;

      // STRICT PRIORITY ORDER — highest accuracy first
      net = net ?? extractNumber(/TOTAL\s*NET[^0-9]*([\d,.]+)/i, text);
      net = net ?? extractNumber(/SUBTOTAL[^0-9]*([\d,.]+)/i, text);
      net = net ?? extractNumber(/AMOUNT\s*EX\s*VAT[^0-9]*([\d,.]+)/i, text);
      net = net ?? extractNumber(/EX\s*VAT[^0-9]*([\d,.]+)/i, text);

      // Medium reliability
      net = net ?? extractNumber(/NET\s*AMOUNT[^0-9]*([\d,.]+)/i, text);

      // Lowest reliability — PAYABLE should NEVER override NET
      net = net ?? extractNumber(/NET\s*PAYABLE[^0-9]*([\d,.]+)/i, text);
      net = net ?? extractNumber(/AMOUNT\s*PAYABLE[^0-9]*([\d,.]+)/i, text);
      net = net ?? extractNumber(/PAYABLE[^0-9]*([\d,.]+)/i, text);

      if (net == null) net = 0;

      let vat =
        extractNumber(/VAT\s*TOTAL[^0-9]*([\d,.]+)/i, text) ??
        extractNumber(/VAT[^0-9]*([\d,.]+)/i, text) ??
        0;

      let gross =
        extractNumber(/BALANCE\s*DUE[^0-9]*([\d,.]+)/i, text) ??
        extractNumber(/TOTAL[^0-9]*([\d,.]+)/i, text) ??
        0;

      let cis =
        extractNumber(/LESS\s*CIS[^0-9]*([\d,.]+)/i, text) ??
        extractNumber(/CIS\s*DEDUCTION[^0-9]*([\d,.]+)/i, text) ??
        0;

      if (net === 0 && gross > 0 && vat >= 0) {
        net = +(gross - vat).toFixed(2);
      }

      const unit = item.qty > 0 ? net / item.qty : net;
      const totalDue = gross > 0 && cis > 0 ? gross - cis : net - cis;

      return {
        vat_check: "VAT removed – Domestic Reverse Charge applies.",
        cis_check: `CIS deduction at 20% applied: £${cis}`,
        required_wording:
          "Reverse Charge: Customer must account for VAT to HMRC (VAT Act 1994 Section 55A).`,
        summary: `Corrected: Net £${net}, CIS £${cis}, Total Due £${totalDue}`,

        corrected_invoice: `
          <div style="font-family:Arial; font-size:14px;">
            <h3 style="color:#4e65ac; margin-bottom:10px;">Corrected Invoice</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
              <tr>
                <th style="border:1px solid #ccc; background:#eef3ff; padding:8px;">Description</th>
                <th style="border:1px solid #ccc; background:#eef3ff; padding:8px;">Qty</th>
                <th style="border:1px solid #ccc; background:#eef3ff; padding:8px;">Unit (£)</th>
                <th style="border:1px solid #ccc; background:#eef3ff; padding:8px;">Line Total (£)</th>
              </tr>
              <tr>
                <td style="border:1px solid #ccc; padding:8px;">${item.description}</td>
                <td style="border:1px solid #ccc; padding:8px;">${item.qty}</td>
                <td style="border:1px solid #ccc; padding:8px;">${unit.toFixed(2)}</td>
                <td style="border:1px solid #ccc; padding:8px;">${net.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="3" style="border:1px solid #ccc; padding:8px; font-weight:bold;">VAT (Reverse Charge)</td>
                <td style="border:1px solid #ccc; padding:8px;">£0.00</td>
              </tr>
              <tr>
                <td colspan="3" style="border:1px solid #ccc; padding:8px;">CIS (20%)</td>
                <td style="border:1px solid #ccc; padding:8px;">-£${cis.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="3" style="border:1px solid #ccc; background:#dfe7ff; padding:8px; font-weight:bold;">
                  Total Due
                </td>
                <td style="border:1px solid #ccc; background:#dfe7ff; padding:8px; font-weight:bold;">
                  £${totalDue.toFixed(2)}
                </td>
              </tr>
            </table>
          </div>
        `
      };
    }

    /* Check whether to apply DRC override */
    let drcResult = null;
    if (parsed.text && detectDRC(parsed.text)) {
      console.log("⚠️ DRC override applied");
      drcResult = correctDRC(parsed.text);
    }

    /* FAISS relevance only */
    let faissContext = "";
    try {
      const matches = await searchIndex(parsed.text, faissIndex);
      faissContext = matches.map((m) => m.meta?.title || "").join("\n");
    } catch (err) {
      console.log("⚠️ FAISS relevance error:", err.message);
    }

    /* AI or override */
    let aiReply;

    if (drcResult) {
      aiReply = drcResult;
    } else {
      aiReply = await analyseInvoice(parsed.text, flags, faissContext);
    }

    /* Generate report */
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

    res.json({
      parserNote: parsed.parserNote,
      aiReply,
      timestamp
    });

  } catch (err) {
    console.error("❌ /check_invoice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------
   /faiss-test — unchanged
------------------------------------------------------------- */

router.get("/faiss-test", async (req, res) => {
  try {
    const matches = await searchIndex("CIS VAT rules", faissIndex);
    const top = matches[0] || {};

    res.json({
      ok: true,
      matchCount: matches.length,
      topScore: top.score || 0,
      preview: top.meta ? top.meta.title : "NONE"
    });

  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;
