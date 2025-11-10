/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-10T17:30:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 */

Dropzone.autoDiscover = false;

Dropzone.options.invoiceDrop = {
  url: "/check_invoice",
  maxFilesize: 10,
  acceptedFiles: ".pdf,.jpg,.png,.json",

  init: function () {
    this.on("sending", (file, xhr, formData) => {
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
    });

    this.on("success", (file, response) => {
      console.log("✅ Upload response:", response);

      const reply = typeof response === "string" ? JSON.parse(response) : response;
      const ai = reply.aiReply || {};
      const actorsDiv = document.getElementById("actors");

      actorsDiv.innerHTML = `
        <h3 style="color:#4e65ac;">Compliance Report</h3>
        <p><strong>${reply.parserNote}</strong></p>
        <ul style="line-height:1.6">
          <li><b>VAT / DRC Check:</b> ${ai.vat_check || "—"}</li>
          <li><b>CIS Check:</b> ${ai.cis_check || "—"}</li>
          <li><b>Required Wording:</b> ${ai.required_wording || "—"}</li>
          <li><b>Summary:</b> ${ai.summary || "—"}</li>
        </ul>
        <p style="font-size:0.9em;color:#555;">${reply.timestamp}</p>
      `;
    });

    this.on("error", (file, err) => {
      console.error("❌ Upload failed:", err);
      alert("Upload failed. See console for details.");
    });
  },
};
export default router;
