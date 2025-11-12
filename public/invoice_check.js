/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-13T08:00:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 * Description:
 * Compact 80 px upload box showing its own live messages,
 * then replacing them with Uploader / Parser info once done.
 * Automatically sends emails if fields are filled.
 * Clears screen by refreshing the page.
 */

Dropzone.autoDiscover = false;

const dz = new Dropzone("#invoiceDrop", {
  url: "/check_invoice",
  maxFiles: 1,
  maxFilesize: 10,
  acceptedFiles: ".pdf,.jpg,.png,.json",
  autoProcessQueue: true,
  addRemoveLinks: false,
  dictDefaultMessage: "📄 Drop file here to upload invoice - accepted files: pdfs",

  init: function () {
    const dzInstance = this;
    const dzElement  = document.getElementById("invoiceDrop");
    const actorsDiv  = document.getElementById("actors");
    const clearBtn   = document.getElementById("clearResultsBtn");

    // --- Clear Results button logic -------------------------------------
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        location.reload(); // 🔄 full page refresh resets Dropzone + screen safely
      });
    }

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
    overlay.textContent = "📄 Drop file here to upload invoice - accepted files: pdfs";
    dzElement.appendChild(overlay);

    // ---- sending --------------------------------------------------------
    dzInstance.on("sending", (file, xhr, formData) => {
      overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);

      // ✅ include email addresses automatically (no button needed)
      formData.append("userEmail", document.getElementById("userEmail").value);
      formData.append("emailCopy1", document.getElementById("emailCopy1").value);
      formData.append("emailCopy2", document.getElementById("emailCopy2").value);
    });

    // ---- success --------------------------------------------------------
    dzInstance.on("success", (file, response) => {
      overlay.innerHTML = `
        <div><strong style="color:#4e65ac;">Uploader:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">Parser:</strong> ${
          response.parserNote || "Invoice parsed successfully."
        }</div>
      `;

      let formattedAI = "";
      const r = response.aiReply || response;

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
              <div style="
                text-align:center;
                font-weight:700;
                font-size:16px;
                color:#c0392b;
                margin-bottom:10px;
                text-transform:uppercase;">
                TAX INVOICE EXAMPLE: NOT FOR USE
              </div>
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

      if (clearBtn) clearBtn.style.display = "inline-block";
    });

    // ---- error ----------------------------------------------------------
    dzInstance.on("error", (file, err) => {
      overlay.innerHTML = `<span style="color:#c0392b;">❌ Upload failed – ${err}</span>`;
    });

    // ---- enforce single file + auto-reset with message ------------------
    dzInstance.on("addedfile", file => {
      const existingReport = document.getElementById("actors")?.innerHTML.trim();
      if (existingReport && existingReport.length > 0) {
        const notice = document.createElement("div");
        notice.style.cssText = `
          position:absolute; inset:0;
          background:rgba(255,255,255,0.95);
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          font-size:15px; font-weight:600;
          color:#4e65ac; z-index:20;
        `;
        notice.textContent = "🔄 Resetting for new upload…";
        dzElement.appendChild(notice);

        console.log("🔄 Auto-reset triggered by new file drop");
        setTimeout(() => location.reload(), 1200);
        return false;
      }

      if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
    });
  },
});
