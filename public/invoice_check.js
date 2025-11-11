/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-11T20:15:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 * Description:
 * Compact 80 px upload box showing its own live messages,
 * then replacing them with Uploader / Parser info once done.
 */

Dropzone.autoDiscover = false;

const dz = new Dropzone("#invoiceDrop", {
  url: "/check_invoice",
  maxFiles: 1,
  maxFilesize: 10,
  acceptedFiles: ".pdf,.jpg,.png,.json",
  autoProcessQueue: true,
  addRemoveLinks: false,
  dictDefaultMessage: "📄 Drop or click to upload invoice",

  init: function () {
    const dzInstance = this;
    const dzElement  = document.getElementById("invoiceDrop");
    const actorsDiv  = document.getElementById("actors");
    const clearBtn   = document.getElementById("clearResultsBtn");

    // --- Clear Results button logic -------------------------------------
    clearBtn.addEventListener("click", () => {
      actorsDiv.innerHTML = "";               // Clear report output
      dzInstance.removeAllFiles(true);        // Remove uploaded file
      const overlay = document.getElementById("uploadOverlay");
      if (overlay) overlay.innerHTML = "📄 Drop or click to upload invoice";
      clearBtn.style.display = "none";        // Hide button again
    });

    // compact fixed height
    dzElement.style.height = "80px";
    dzElement.style.minHeight = "80px";
    dzElement.style.position = "relative";
    dzElement.style.overflow = "hidden";

    // create inner message layer
    const overlay = document.createElement("div");
    overlay.id = "uploadOverlay";
    overlay.style.cssText = `
      position:absolute;
      inset:0;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      background:#fff;
      color:#4e65ac;
      font-weight:600;
      font-size:14px;
      text-align:center;
      z-index:10;
      transition:opacity 0.3s ease;
    `;
    overlay.textContent = "📄 Drop or click to upload invoice";
    dzElement.appendChild(overlay);

    // ---- sending (start upload) ----------------------------------------
    dzInstance.on("sending", (file, xhr, formData) => {
      overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
    });

    // ---- success --------------------------------------------------------
    dzInstance.on("success", (file, response) => {
      // Replace overlay content with Uploader + Parser lines inside the same box
      overlay.innerHTML = `
        <div><strong style="color:#4e65ac;">Uploader:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">Parser:</strong> ${
          response.parserNote || "Invoice parsed successfully."
        }</div>
      `;

      // --- Build readable AI report ------------------------------------
      let formattedAI = "";
      const r = response.aiReply || response; // handle nested or flat response

      if (r.vat_check || r.cis_check || r.required_wording || r.summary) {
        formattedAI = `
          <div style="padding:8px;">
            <h3 style="color:#4e65ac;font-size:16px;font-weight:600;margin-bottom:8px;">
              AI Compliance Report
            </h3>
            <p><strong>VAT / DRC Check:</strong><br>${r.vat_check || "—"}</p>
            <p><strong>CIS Check:</strong><br>${r.cis_check || "—"}</p>
            <p><strong>Required Wording:</strong><br>${r.required_wording || "—"}</p>
            <p><strong>Summary:</strong><br>${r.summary || "—"}</p>
          </div>`;
      }

      if (r.corrected_invoice) {
        formattedAI += `
          <div style="margin-top:12px;">
            <h4 style="color:#4e65ac;margin-bottom:6px;">Corrected Invoice Preview</h4>
            <div style="border:1px solid #e7ebf3;padding:10px;background:#f9f9fb;">
              ${r.corrected_invoice}
            </div>
          </div>`;
      }

      if (!formattedAI) {
        formattedAI = `<pre style="white-space:pre-wrap;font-size:13px;color:#333;">
${JSON.stringify(response, null, 2)}
</pre>`;
      }

      actorsDiv.innerHTML = `
        ${formattedAI}
        <div class="actor" style="margin-top:10px;">
          <span style="color:#4e65ac;font-weight:600;">Response Time:</span>
          ${response.timestamp || "—"}
        </div>`;

      // Show Clear button
      clearBtn.style.display = "inline-block";
    });

    // ---- error ----------------------------------------------------------
    dzInstance.on("error", (file, err) => {
      overlay.innerHTML = `<span style="color:#c0392b;">❌ Upload failed – ${err}</span>`;
    });

    // ---- enforce single file -------------------------------------------
    dzInstance.on("addedfile", () => {
      if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
    });
  },
});
