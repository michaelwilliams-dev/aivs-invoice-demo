/**
 * AIVS Invoice Compliance Checker · Parsing & Analysis Tools
 * ISO Timestamp: 2025-11-18T12:00:00Z
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
You must check the invoice and return the corrected version in HTML.

CRITICAL RULES:
- Do NOT include bank details, sort codes, IBANs, SWIFT, or any payment info.
- Do NOT hallucinate bank or payment details.
- The invoice must contain ZERO banking information.

Context:
- VAT: ${vatDecision.vatLabel}
- DRC applies: ${vatDecision.drc ? "Yes" : "No"}
- CIS rate: ${flags.cisRate}%
- Reason: ${vatDecision.reason}

TASKS:
1. Check VAT/DRC treatment.
2. Check CIS calculation.
3. Identify required/missing wording.
4. Produce corrected invoice layout using the template below.
5. Insert totals, VAT, CIS, subtotal, total due.
6. Leave placeholders if required values cannot be extracted.

RETURN JSON IN THIS EXACT SHAPE:
{
  "vat_check": "...",
  "cis_check": "...",
  "required_wording": "...",
  "corrected_invoice": "<HTML>",
  "summary": "..."
}

USE THIS FULL INVOICE TEMPLATE (BANK-FREE):

<template>
<div style="max-width:820px;margin:0 auto;
            font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;color:#222">

  <!-- HEADER -->
  <div style="border-bottom:3px solid #4e65ac;padding-bottom:8px;margin-bottom:16px">
    <div style="font-size:12px;color:#555">
      Company Registration No: 15284926 · Registered Office: 7200 The Quorum,
      Oxford Business Park North, Oxford, OX4 2JZ, United Kingdom
    </div>
    <h1 style="margin:8px 0 0;font-size:22px;letter-spacing:.5px;color:#4e65ac">TAX INVOICE</h1>
  </div>

  <!-- PARTIES -->
  <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:16px">
    <div style="flex:1">
      <div style="font-weight:600;margin-bottom:4px;color:#4e65ac">Bill To</div>
      <div>[[CLIENT_NAME]]</div>
      <div>[[CLIENT_ADDRESS_LINE_1]]</div>
      <div>[[CLIENT_ADDRESS_LINE_2]]</div>
      <div>[[CLIENT_ADDRESS_LINE_3]]</div>
      <div>[[CLIENT_POSTCODE]]</div>
      <div>United Kingdom</div>
    </div>
    <div style="flex:1">
      <div style="font-weight:600;margin-bottom:4px;color:#4e65ac">From</div>
      <div>[[SUPPLIER_NAME]]</div>
      <div>[[SUPPLIER_ADDRESS_LINE_1]]</div>
      <div>[[SUPPLIER_ADDRESS_LINE_2]]</div>
      <div>[[SUPPLIER_ADDRESS_LINE_3]]</div>
      <div>VAT No: [[VAT_NUMBER]]</div>
    </div>
  </div>

  <!-- LINE ITEMS -->
  <table style="width:100%;border-collapse:collapse;margin-top:4px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Description</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Qty</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Unit Price (£)</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">VAT Rate</th>
        <th style="text-align:right;padding:8px;border:1px solid #e7ebf3;background:#f6f8fb;color:#4e65ac">Line Total (£)</th>
      </tr>
    </thead>
    <tbody>
      [[LINE_ITEMS]]
    </tbody>
  </table>

  <!-- TOTALS -->
  <div style="margin-top:20px;border-top:2px solid #e7ebf3;padding-top:14px">

    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <div>Subtotal</div>
      <div><strong>£[[SUBTOTAL]]</strong></div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <div>VAT ([[VAT_RATE]]%)</div>
      <div><strong>£[[VAT_AMOUNT]]</strong></div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <div>CIS Deduction ([[CIS_RATE]]%)</div>
      <div><strong>£[[CIS_AMOUNT]]</strong></div>
    </div>

    <div style="display:flex;justify-content:space-between;
                font-size:17px;margin-top:10px;border-top:2px solid #d9dfe8;padding-top:10px">
      <div><strong>Total Due</strong></div>
      <div><strong>£[[TOTAL_DUE]]</strong></div>
    </div>

  </div>

  <!-- NOTES -->
  <div style="margin-top:20px;padding:10px;border:1px dashed #cfd6e4;background:#f8fafc">
    <div style="font-weight:600;color:#4e65ac;margin-bottom:6px">Notes</div>
    <div>- This supply is <strong>${vatDecision.vatLabel}</strong>. 
         ${vatDecision.drc ? "DRC applies." : "The Domestic Reverse Charge does not apply."}</div>
    <div>- CIS applied at ${flags.cisRate}% on labour only.</div>
    <div>- Please retain this invoice for your accounting records.</div>
  </div>

</div>
</template>

INVOICE TEXT:
${text}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const result = JSON.parse(res.choices[0].message.content);

    // SAFETY: Strip ANY remaining bank info
    if (result.corrected_invoice) {
      result.corrected_invoice = result.corrected_invoice
        .replace(/bank.*?<.*?>/gi, "")
        .replace(/sort.?code.*?<.*?>/gi, "")
        .replace(/account.*?<.*?>/gi, "")
        .replace(/iban.*?<.*?>/gi, "")
        .replace(/swift.*?<.*?>/gi, "")
        .replace(/payment.*?<.*?>/gi, "");
    }

    return result;

  } catch (err) {
    console.error("JSON parse error:", err.message);
    return { error: "Invalid JSON returned from AI" };
  }
}
