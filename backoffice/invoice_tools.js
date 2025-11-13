/**
 * AIVS Invoice Compliance Checker · Parsing & Analysis Tools
 * ISO Timestamp: 2025-11-12T11:25:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 */

import pdf from "pdf-parse";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------
 * 1. Parse invoice PDF → extract raw text
 * ------------------------------------------------------------- */
export async function parseInvoice(fileBuffer) {
  const data = await pdf(fileBuffer);
  return { text: data.text, parserNote: "Invoice parsed successfully." };
}

/* -------------------------------------------------------------
 * 2. VAT + DRC decision logic (local rules)
 * ------------------------------------------------------------- */
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

/* -------------------------------------------------------------
 * 3. INTERNAL FAISS lookup from Accounting-Pro
 * ------------------------------------------------------------- */
async function getFaissContext(queryText) {
  try {
    const resp = await fetch(
      "https://account-assistant-pro.onrender.com/internal-faiss-search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.INTERNAL_API_KEY}`
        },
        body: JSON.stringify({ query: queryText })
      }
    );

    if (!resp.ok) {
      console.error("FAISS service error:", await resp.text());
      return "";
    }

    const data = await resp.json();
    return data.context || "";
  } catch (err) {
    console.error("FAISS call failed:", err.message);
    return "";
  }
}

/* -------------------------------------------------------------
 * 4. Analyse invoice using FAISS + OpenAI
 * ------------------------------------------------------------- */
export async function analyseInvoice(text, flags) {
  const vatDecision = decideVatAndDRC(text, flags);

  // ---- FAISS Search ----
  const faissContext = await getFaissContext(text);

  // ---- Build prompt ----
  const prompt = `
You are a UK accounting compliance expert (HMRC CIS & VAT).

Use BOTH sources of information below:

---------------------------------------------------------
1) FAISS knowledge from AIVS Accounting-Pro index:
---------------------------------------------------------
${faissContext}
---------------------------------------------------------

2) Extracted invoice data and user flags:
---------------------------------------------------------
VAT category: ${vatDecision.vatLabel}
DRC applies: ${vatDecision.drc ? "Yes" : "No"}
CIS rate: ${flags.cisRate}%
Reason: ${vatDecision.reason}
---------------------------------------------------------

Your tasks:
1. Check VAT & DRC treatment.
2. Check CIS calculation on labour.
3. Identify missing statutory wording.
4. Provide corrected invoice wording & compliance notes.
5. Return valid JSON using the template provided.

Invoice text:
${text}
`;

  // ---- AI Call ----
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const result = JSON.parse(res.choices[0].message.content);

    // Auto-correct “No VAT”
    if (result.corrected_invoice && result.corrected_invoice.includes("No VAT")) {
      result.corrected_invoice = result.corrected_invoice.replace(/No VAT/gi, "Zero-rated (0 %)");
    }

    return result;

  } catch (err) {
    console.error("JSON parse error:", err.message);
    return { error: "Invalid JSON returned from AI" };
  }
}
