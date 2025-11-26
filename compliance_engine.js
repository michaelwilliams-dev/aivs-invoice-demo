// ISO Timestamp: 2025-11-24T21:50:00Z
/**
 * compliance_engine.js – AIVS VAT/CIS Logic Engine (HMRC-Aligned)
 */

export function runComplianceChecks(raw) {
  try {
    const text = (raw || "").toLowerCase();

    /* ----------------------------------------------------------
       0. AMOUNT EXTRACTION (corrected)
    ---------------------------------------------------------- */

    const money = { net: null, vat: null, total: null };
    const cleaned = raw.replace(/,/g, "").toLowerCase();

    // NET extraction
    const netMatch =
      cleaned.match(/subtotal[^0-9]*([0-9.]+)/) ||
      cleaned.match(/total\s*net[^0-9]*([0-9.]+)/);

    if (netMatch) money.net = parseFloat(netMatch[1]);

    // VAT extraction – handles VAT TOTAL, VAT\n400.00, VAT: 400.00
    const vatMatch =
      cleaned.match(/vat[^\d]*([0-9]+\.[0-9]{2})/) ||
      cleaned.match(/vat\s*total[^\d]*([0-9]+\.[0-9]{2})/) ||
      cleaned.match(/vat\s*\n\s*([0-9]+\.[0-9]{2})/);

    if (vatMatch) money.vat = parseFloat(vatMatch[1]);

    // TOTAL extraction
    const totalMatch =
      cleaned.match(/total[^0-9]*([0-9.]+)/) ||
      cleaned.match(/amount\s*due[^0-9]*([0-9.]+)/);

    if (totalMatch) money.total = parseFloat(totalMatch[1]);

    /* ----------------------------------------------------------
       1. DETECTION LAYER (HMRC-compliant)
    ---------------------------------------------------------- */

    // HMRC CIS-labour list
    const labourSignals = [
      "labour", "labor",

      // Groundworks / Civils
      "groundworks", "site preparation", "site clearance", "excavation",
      "earth moving", "foundations", "footings",

      // Structural
      "bricklaying", "brickwork", "blockwork", "concrete",
      "masonry", "steel fixing", "formwork", "shuttering",

      // Carpentry / Joinery
      "carpentry", "carpenter", "joinery", "joiner", "first fix", "second fix",

      // Electrical (construction only)
      "electrical installation", "wiring install", "install lighting",

      // Plumbing / Gas (construction)
      "pipework", "plumbing", "boiler installation", "cylinder installation",

      // Roofing
      "roofing", "reroof", "roof repairs",

      // Landscaping (construction)
      "paving", "slabbing", "fencing install", "decking install",
      "retaining wall",

      // Demolition
      "demolition", "strip out", "dismantling",

      // Scaffolding
      "scaffold", "scaffolding", "erection",

      // Finishing
      "painting", "decorating", "building maintenance", "repairs to"
    ];

    const hasLabour = labourSignals.some(term => text.includes(term));

    // Materials list (non-labour)
    const materialSignals = [
      "material", "materials", "timber", "plasterboard", "screws",
      "fixings", "paint", "consumables", "adhesive", "sealant",
      "tiles", "roofing felt", "upvc", "copper pipe", "boiler",
      "cylinder", "lighting unit", "accessories"
    ];

    const hasMaterials = materialSignals.some(term => text.includes(term));

    const detected = {
      hasLabour,
      hasMaterials,

      // Reverse charge – only legal triggers
      reverseCharge:
        text.includes("reverse charge") ||
        text.includes("domestic reverse charge") ||
        text.includes("vat act 1994") ||
        text.includes("section 55a"),

      domestic: text.includes("homeowner") || text.includes("domestic"),
      commercial:
        text.includes("limited") ||
        text.includes("ltd") ||
        text.includes("contractor") ||
        text.includes("commercial")
    };

    /* ----------------------------------------------------------
       2. VAT LOGIC
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
      vatSummary = "Standard-rated VAT invoice.";
    } else if (money.vat === 0) {
      vat_check = "Zero-rated or unclear VAT treatment.";
      vatSummary = "No VAT detected.";
    } else {
      vat_check = "Cannot confirm VAT treatment from the text.";
      vatSummary = "VAT unclear.";
    }

    /* ----------------------------------------------------------
       3. CIS LOGIC (HMRC rules)
    ---------------------------------------------------------- */

    let cis_check = "";

    if (detected.hasLabour && !detected.hasMaterials) {
      cis_check = "Labour-only supply: CIS normally applies.";
    } else if (detected.hasLabour && detected.hasMaterials) {
      cis_check = "Mixed supply: CIS applies to labour portion only.";
    } else if (!detected.hasLabour && detected.hasMaterials) {
      cis_check = "Materials-only supply: CIS must NOT apply.";
    } else {
      cis_check = "Unable to determine CIS applicability.";
    }

    /* ----------------------------------------------------------
       4. SUMMARY OUTPUT
    ---------------------------------------------------------- */

    const summary = `
Detected Amounts:
  • Net: £${money.net ?? "—"}
  • VAT: £${money.vat ?? "—"}
  • Total: £${money.total ?? "—"}

VAT Summary: ${vatSummary}
CIS Summary: ${cis_check}
Required Wording: ${required_wording || "None required"}
    `.trim();

    /* ----------------------------------------------------------
       5. SCREEN PREVIEW (unchanged)
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
