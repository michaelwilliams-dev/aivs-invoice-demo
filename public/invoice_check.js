/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-11T19:50:00Z
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
  dictDefaultMessage: "📄 Drop file here  to upload invoice - accepted files: pdf jpg png json",

  init: function () {
    const dzInstance = this;
    const dzElement  = document.getElementById("invoiceDrop");
    const actorsDiv  = document.getElementById("actors");
    const clearBtn   = document.getElementById("clearResultsBtn");

    // --- Clear Results button logic -------------------------------------
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        actorsDiv.innerHTML = "";
        dzInstance.removeAllFiles(true);
        const overlay = document.getElementById("uploadOverlay");
        if (overlay) overlay.innerHTML = "📄 Drop file here  to upload invoice - accepted files: pdf jpg png json";
        clearBtn.style.display = "none";
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
    overlay.textContent = "📄 Drop or click to upload invoice";
    dzElement.appendChild(overlay);

    // ---- sending --------------------------------------------------------
    dzInstance.on("sending", (file, xhr, formData) => {
      overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
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

    // ---- enforce single file -------------------------------------------
    dzInstance.on("addedfile", () => {
      if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
    });
  },
});

// --- Manual Send Email Button ----------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendEmailBtn");
  if (!sendBtn) return;

  sendBtn.addEventListener("click", async () => {
    const userEmail  = document.getElementById("userEmail")?.value.trim();
    const emailCopy1 = document.getElementById("emailCopy1")?.value.trim();
    const emailCopy2 = document.getElementById("emailCopy2")?.value.trim();

    if (!userEmail) {
      alert("Please enter at least one recipient email address before sending.");
      return;
    }

    try {
      const res = await fetch("/send_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail, emailCopy1, emailCopy2 }),
      });
      const data = await res.json();
      if (data.status === "email_sent") {
        alert("✅ Email sent successfully!");
      } else {
        alert("⚠️ Email not sent: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("❌ Failed to send email: " + err.message);
    }
  });
});
