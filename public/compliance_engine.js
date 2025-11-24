// ISO Timestamp: 2025-11-24T12:30:00Z
/**
 * invoice_checker.js – AIVS CIS / VAT Rules Engine
 * This file receives structured JSON from Docling and applies:
 *  - VAT logic
 *  - CIS logic
 *  - Wording checks
 *  - Corrected invoice formatting
 */

export function checkInvoice(docJson) {
  try {
    // ------------------------------------------------------------
    // 1. Normalise input (Docling JSON layout varies)
    // ------------------------------------------------------------
    const text = JSON.stringify(docJson).toLowerCase();

    // Extract scan of values (very basic for now)
    const detected = {
      hasLabour: text.includes("labour") || text.includes("labour only"),
      hasMaterials: text.includes("materials") || text.includes("material"),
      mentionsReverseCharge:
        text.includes("reverse charge") || text.includes("vat act 1994"),
      mentionsCis20: text.includes("20%") && text.includes("cis"),
    };

    // ------------------------------------------------------------
    // 2. VAT Logic (simple rule engine for now)
    // ------------------------------------------------------------
    let vat_check = "Unable to determine VAT treatment.";
    let required_wording = "";
    let vatSummary = "";

    if (detected.mentionsReverseCharge) {
      vat_check = "Reverse charge VAT wording detected.";
      required_wording =
        "This invoice must not charge VAT. Customer to account for VAT to HMRC (VAT Act 1994 Section 55A).";
      vatSummary = "Reverse charge rules appear to apply.";
    } else if (detected.hasLabour && !detected.hasMaterials) {
      vat_check = "Likely labour-only supply. Usually subject to reverse charge for CIS-registered customers.";
      required_wording =
        "Check reverse charge wording: 'Reverse charge: customer to account for VAT to HMRC'.";
      vatSummary = "Possible reverse-charge labour supply.";
    } else {
      vat_check = "Standard or reduced VAT. Please confirm 20%, 5% or 0% manually.";
      vatSummary = "Conventional VAT supply.";
    }

    // ------------------------------------------------------------
    // 3. CIS Logic (simple rule engine)
    // ------------------------------------------------------------
    let cis_check = "Unable to determine CIS status.";

    if (detected.hasLabour && !detected.hasMaterials) {
      cis_check =
        "Labour-only supply: CIS deduction normally applies unless supplier has Gross Payment Status.";
    } else if (detected.hasLabour && detected.hasMaterials) {
      cis_check =
        "Labour + materials: CIS applies to labour portion only. Materials must be listed separately.";
    } else if (detected.hasMaterials && !detected.hasLabour) {
      cis_check = "Materials-only: CIS should NOT be applied.";
    } else {
      cis_check = "Cannot determine CIS from extracted document.";
    }

    // ------------------------------------------------------------
    // 4. Summary
    // ------------------------------------------------------------
    const summary = `
      VAT Summary: ${vatSummary}
      CIS Summary: ${cis_check}
      Recommended wording: ${required_wording}
    `.trim();

    // ------------------------------------------------------------
    // 5. Generate a corrected invoice layout (simple placeholder)
    // ------------------------------------------------------------
    const corrected_invoice = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#f3f3f3; font-weight:bold;">
            <td>Description</td>
            <td>Qty</td>
            <td>Unit Price (£)</td>
            <td>VAT Rate</td>
            <td>Line Total (£)</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Example labour line</td>
            <td>1</td>
            <td>0.00</td>
            <td>Reverse Charge</td>
            <td>0.00</td>
          </tr>
        </tbody>
      </table>
    `;

    // ------------------------------------------------------------
    // 6. Return full structure
    // ------------------------------------------------------------
    return {
      vat_check,
      cis_check,
      required_wording,
      summary,
      corrected_invoice,
    };
  } catch (err) {
    console.error("❌ Invoice checker failed:", err);
    return {
      vat_check: "Error",
      cis_check: "Error",
      required_wording: "",
      summary: "Checker failure — see logs.",
      corrected_invoice: "",
    };
  }
}
