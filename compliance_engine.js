// ISO Timestamp: 2025-11-24T21:50:00Z
/**
 * compliance_engine.js – AIVS VAT/CIS Logic Engine (enhanced)
 * Adds: numeric extraction, VAT detection, materials/labour heuristics
 */

export function runComplianceChecks(raw) {
  try {
    const text = (raw || "").toLowerCase();

    /* ----------------------------------------------------------
       0. AMOUNT EXTRACTION (new)
       Extract NET / VAT / TOTAL lines from invoice text
    ---------------------------------------------------------- */

    const money = {
      net: null,
      vat: null,
      total: null
    };

    // Normalise commas and £ signs
    const cleaned = raw.replace(/,/g, "").toLowerCase();

    // Match: TOTAL NET £1200 / NET £1200 / subtotal £1200
    const netMatch =
      cleaned.match(/total\s*net[^0-9]*([0-9.]+)/) ||
      cleaned.match(/net[^0-9]*([0-9.]+)/) ||
      cleaned.match(/subtotal[^0-9]*([0-9.]+)/);

    if (netMatch) money.net = parseFloat(netMatch[1]);

    // Match VAT: VAT £240 / VAT amount £240
    const vatMatch =
      cleaned.match(/vat[^0-9]*([0-9.]+)/) ||
      cleaned.match(/vat\s*amount[^0-9]*([0-9.]+)/);

    if (vatMatch) money.vat = parseFloat(vatMatch[1]);

    // Match TOTAL: TOTAL £1440 / amount due £1440
    const totalMatch =
      cleaned.match(/total[^0-9]*([0-9.]+)/) ||
      cleaned.match(/amount\s*due[^0-9]*([0-9.]+)/);

    if (totalMatch) money.total = parseFloat(totalMatch[1]);

    /* ----------------------------------------------------------
       1. DETECTION LAYER
    ---------------------------------------------------------- */
    const detected = {
      hasLabour:
        text.includes("labour") ||
        text.includes("day") ||
        text.includes("days") ||
        text.includes("work") ||
        text.includes("carpentry") ||
        text.includes("carpenter"),

      hasMaterials:
        text.includes("material") ||
        text.includes("timber") ||
        text.includes("deck") ||
        text.includes("decking") ||
        text.includes("supplies"),

      reverseCharge:
        text.includes("reverse charge") ||
        text.includes("domestic reverse charge") ||
        text.includes("vat act 1994"),

      domestic:
        text.includes("homeowner") ||
        text.includes("domestic"),

      commercial:
        text.includes("limited") ||
        text.includes("ltd") ||
        text.includes("contractor") ||
        text.includes("commercial")
    };

    /* ----------------------------------------------------------
       2. VAT LOGIC (improved)
    ---------------------------------------------------------- */
    let vat_check = "";
    let required_wording = "";
    let vatSummary = "";

    if (detected.reverseCharge) {
      vat_check = "Reverse charge VAT wording detected.";
      required_wording =
        "Reverse charge applies: Customer to account for VAT to HMRC (VAT Act 1994 s55A).";
      vatSummary = "Reverse charge explicitly indicated.";
    } else if (money.vat > 0) {
      vat_check = `Standard VAT charged: £${money.vat.toFixed(2)}`;
      required_wording = "";
      vatSummary = "Standard-rated VAT invoice.";
    } else if (money.vat === 0) {
      vat_check = "Zero-rated or reverse-charge supply indicated.";
      vatSummary = "No VAT charged.";
      required_wording = detected.commercial
        ? "Add reverse charge wording if supply falls under CIS."
        : "";
    } else {
      vat_check = "Cannot confirm VAT treatment from the text.";
      vatSummary = "VAT unclear from invoice text.";
    }

    /* ----------------------------------------------------------
       3. CIS LOGIC (improved)
    ---------------------------------------------------------- */
    let cis_check = "";

    if (detected.hasLabour && !detected.hasMaterials) {
      cis_check = "Labour-only supply: CIS normally applies.";
    } else if (detected.hasLabour && detected.hasMaterials) {
      cis_check = "Mixed supply: CIS applies to labour portion only.";
    } else if (!detected.hasLabour && detected.hasMaterials) {
      cis_check = "Materials-only supply: CIS must NOT apply.";
    } else {
      cis_check = "Unable to determine CIS applicability from the text.";
    }

    /* ----------------------------------------------------------
       4. SUMMARY
    ---------------------------------------------------------- */
    const summary = `
Detected Amounts:
  • Net: £${money.net ?? "—"}
  • VAT: £${money.vat ?? "—"}
  • Total: £${money.total ?? "—"}

VAT Summary: ${vatSummary}
CIS Summary: ${cis_check}
Required Wording: ${required_wording || "None detected"}
    `.trim();

    /* ----------------------------------------------------------
       5. SCREEN-ONLY PREVIEW (unchanged)
    ---------------------------------------------------------- */
    const corrected_invoice = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#f3f3f3; font-weight:bold;">
            <td>Description</td>
            <td>Category</td>
            <td>Amount (£)</td>
            <td>VAT Rate</td>
            <td>Notes</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Labour (example)</td>
            <td>Labour</td>
            <td>${money.net ? money.net.toFixed(2) : "0.00"}</td>
            <td>${detected.reverseCharge ? "Reverse Charge" : "20%"}</td>
            <td>Screen preview only</td>
          </tr>
        </tbody>
      </table>
    `;

    return {
      vat_check,
      cis_check,
      required_wording,
      summary,
      corrected_invoice
    };

  } catch (err) {
    console.error("❌ compliance_engine.js error:", err);
    return {
      vat_check: "Error",
      cis_check: "Error",
      required_wording: "",
      summary: "Compliance engine crashed.",
      corrected_invoice: ""
    };
  }
}
