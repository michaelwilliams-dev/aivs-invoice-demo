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

    const labourSignals = [
      "labour", "labor",
      "groundworks", "site preparation", "site clearance", "excavation",
      "earth moving", "foundations", "footings",
      "bricklaying", "brickwork", "blockwork", "concrete",
      "masonry", "steel fixing", "formwork", "shuttering",
      "carpentry", "carpenter", "joinery", "joiner",
      "first fix", "second fix",
      "electrical installation", "wiring install", "install lighting",
      "pipework", "plumbing", "boiler installation", "cylinder installation",
      "roofing", "reroof", "roof repairs",
      "paving", "slabbing", "fencing install", "decking install", "retaining wall",
      "demolition", "strip out", "dismantling",
      "scaffold", "scaffolding", "erection",
      "painting", "decorating", "building maintenance", "repairs to"
    ];

    const hasLabour = labourSignals.some(term => text.includes(term));

    const materialSignals = [
      "material", "materials", "timber", "plasterboard", "screws",
      "fixings", "paint", "consumables", "adhesive", "sealant",
      "tiles", "roofing felt", "upvc", "copper pipe",
      "boiler", "cylinder", "lighting unit", "accessories"
    ];

    const hasMaterials = materialSignals.some(term => text.includes(term));

    const detected = {
      hasLabour,
      hasMaterials,

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
      cis_check = "Unable to determine
