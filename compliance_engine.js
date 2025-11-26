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
        text.includes("
