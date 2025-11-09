/**
 * AIVS Invoice Compliance Checker · Parsing & Analysis Tools
 * ISO Timestamp: 2025-11-09T18:30:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 */

import pdf from "pdf-parse";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function parseInvoice(fileBuffer) {
  const data = await pdf(fileBuffer);
  return { text: data.text, parserNote: "Invoice parsed successfully." };
}

function decideVatAndDRC(text, flags) {
  const t = text.toLowerCase();
  const isNewBuild =
    /new build|new dwelling|plot \d+|nhbc|completion certificate|cml/.test(t) ||
    flags.vatCategory === "zero-rated-new-build";

  if (isNewBuild) {
    return {
      vatRate: 0,
      vatLabel: "Zero-rated (new build dwelling)",
      drc: false,
      reason: "New build dwelling → zero-rated; DRC excluded."
    };
  }

  const reduced = flags.vatCategory === "reduced-5" || /reduced rate|5%/.test(t);
  const endUser = flags.endUserConfirmed === "true";

  return {
    vatRate: reduced ? 5 : 20,
    vatLabel: reduced ? "Reduced rate 5%" : "Standard rate 20%",
    drc: !endUser && !isNewBuild,
    reason: endUser
      ? "End-user/intermediary declared → DRC excluded."
      : "Standard/reduced-rated supply → DRC may apply."
  };
}

export async function analyseInvoice(text, flags) {
  const vatDecision = decideVatAndDRC(text, flags);

  const prompt = `
You are a UK accounting compliance expert (HMRC CIS & VAT).
Use the user-supplied context below to check this invoice.

Context:
- VAT category: ${vatDecision.vatLabel}
- DRC applies: ${vatDecision.drc ? "Yes" : "No"}
- CIS rate: ${flags.cisRate}%
- Reason: ${vatDecision.reason}

Please return a JSON object with the following structure:
{
  "vat_check": "...",
  "cis_check": "...",
  "required_wording": "...",
  "corrected_invoice": "<HTML layout of the corrected invoice, following the template below>",
  "summary": "..."
}

Use the following HTML invoice template when constructing the corrected_invoice field:

<template>
<div style="max-width:820px;margin:0 auto;font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;color:#222">
  <div style="border-bottom:3px solid #4e65ac;padding-bottom:8px;margin-bottom:16px">
    <div style="font-size:12px;color:#555">
      Company Registration No: 15284926 · Registered Office: 7200 The Quorum, Oxford Business Park North, Oxford, OX4 2JZ, United Kingdom
    </div>
    <h1 style="margin:8px 0 0;font-size:22px;letter-spacing:.5px;color:#4e65ac">TAX INVOICE</h1>
  </div>

  <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:16px">
    <div style="flex:1">
      <div style="font-weight:600;margin-bottom:4px;color:#4e65ac">Bill To</div>
      <div>Thakeham Homes</div>
      <div>Thakeham House</div>
      <div>Stane Street</div>
      <div>Billingshurst</div>
      <div>West Sussex RH14 9GN</div>
      <div>United Kingdom</div>
    </div>
    <div style="flex:1">
      <div style="font-weight:600;margin-bottom:4px;color:#4e65ac">From</div>
      <div>FeKTA Limited</div>
      <div>7200 The Quorum</div>
      <div>Oxford Business Park North</div>
      <div>Oxford OX4 2JX</div>
      <div>VAT No: 454802785</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:4px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Description</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Qty</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Unit Price (£)</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">VAT</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Amount (£)</th>
      </tr>
    </thead>
  </table>

  <div style="margin-top:14px">
    <div style="font-weight:600;color:#4e65ac;margin-bottom:4px">Bank Details</div>
    <div>Bank: NatWest · Account: 10131728 · Sort Code: 60-17-21</div>
  </div>

  <div style="margin-top:14px;padding:10px;border:1px dashed #cfd6e4;background:#f8fafc">
    <div style="font-weight:600;color:#4e65ac;margin-bottom:6px">Notes</div>
    <div>- This supply is <strong>zero-rated for VAT</strong> as it relates to a new-build dwelling (VATA 1994 Sch 8 Group 5). The Domestic Reverse Charge does <strong>not</strong> apply to zero-rated supplies.</div>
    <div>- <strong>CIS</strong> deduction applied at 20% on the labour element only.</div>
  </div>
</div>
</template>

Invoice text:
${text}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const result = JSON.parse(res.choices[0].message.content);
    return result;
  } catch (err) {
    console.error("⚠️ JSON parse error:", err.message);
    return { error: "Invalid JSON returned from AI" };
  }
}
