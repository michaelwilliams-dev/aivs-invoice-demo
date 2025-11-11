/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-11T19:30:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 * Description:
 * One-step upload → AI compliance report.
 * Shows “Uploading…” in-box, then Uploader / Parser + AI report automatically.
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

    // compact box
    dzElement.style.height = "80px";
    dzElement.style.minHeight = "80px";
    dzElement.style.position = "relative";
    dzElement.style.overflow = "hidden";

    // overlay message layer
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
    `;
    overlay.textContent = "📄 Drop or click to upload invoice";
    dzElement.appendChild(overlay);

    // ---- start upload -----------------------------------------------------
    dzInstance.on("sending", (file, xhr, formData) => {
      overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
    });

    // ---- upload success → display report automatically -------------------
    dzInstance.on("success", (file, response) => {
      // confirmation inside box
      overlay.innerHTML = `
        <div><strong style="color:#4e65ac;">Uploader:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">Parser:</strong> ${
          response.parserNote || "Invoice parsed successfully."
        }</div>
      `;

      // show AI report below
      let formattedAI = "";
      if (response.aiReply) {
        formattedAI = `
          <div class="actor">
            <h3 style="color:#4e65ac;font-size:16px;font-weight:600;margin-bottom:6px;">
              AI Compliance Report
            </h3>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.5;color:#333;">
              ${response.aiReply}
            </div>
          </div>`;
      } else if (response.error) {
        formattedAI = `
          <div style="padding:10px;color:#c0392b;">
            ❌ ${response.error}
          </div>`;
      }

      actorsDiv.innerHTML = `
        ${formattedAI}
        <div class="actor" style="margin-top:10px;">
          <span style="color:#4e65ac;font-weight:600;">Response Time:</span>
          ${response.timestamp || "—"}
        </div>`;
    });

    // ---- error ------------------------------------------------------------
    dzInstance.on("error", (file, err) => {
      overlay.innerHTML = `<span style="color:#c0392b;">❌ Upload failed – ${err}</span>`;
    });

    // ---- single file only -------------------------------------------------
    dzInstance.on("addedfile", () => {
      if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
    });
  },
});
