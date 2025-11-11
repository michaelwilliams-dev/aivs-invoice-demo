/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-11T18:10:00Z
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
    const startBtn   = document.getElementById("startCheckBtn");
    const actorsDiv  = document.getElementById("actors");

    startBtn.style.display = "none";

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

    // ---- sending (start upload) ------------------------------------------
    dzInstance.on("sending", (file, xhr, formData) => {
      overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
    });

    // ---- success ----------------------------------------------------------
    dzInstance.on("success", (file, response) => {
      // Replace overlay content with Uploader + Parser lines inside the same box
      overlay.innerHTML = `
        <div><strong style="color:#4e65ac;">Uploader:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">Parser:</strong> ${response.parserNote || "File parsed successfully."}</div>
      `;
      startBtn.style.display = "block";
    });

    // ---- error ------------------------------------------------------------
    dzInstance.on("error", (file, err) => {
      overlay.innerHTML = `<span style="color:#c0392b;">❌ Upload failed – ${err}</span>`;
    });

    // ---- enforce single file ---------------------------------------------
    dzInstance.on("addedfile", () => {
      if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
    });

    // ---- Start Compliance Check (real backend report) ---------------------
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      startBtn.textContent = "Generating Report…";

      actorsDiv.innerHTML = `
        <div style="padding:15px;color:#4e65ac;font-weight:600;">
          ⚙️ Generating compliance report…
        </div>`;

      try {
        const res = await fetch("/check_invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "generateReport",
            filename: dz.files[0]?.name || "",
          }),
        });

        const data = await res.json();

        if (data.aiReply) {
          actorsDiv.innerHTML = `
            <div class="actor">
              <h3 style="color:#4e65ac;font-size:16px;font-weight:600;margin-bottom:6px;">
                AI Compliance Report
              </h3>
              <div style="white-space:pre-wrap;font-size:14px;line-height:1.5;color:#333;">
                ${data.aiReply}
              </div>
            </div>
            <div class="actor" style="margin-top:10px;">
              <span style="color:#4e65ac;font-weight:600;">Response Time:</span>
              ${data.timestamp || "—"}
            </div>`;
        } else {
          actorsDiv.innerHTML = `
            <div style="padding:15px;color:#c0392b;">
              ⚠️ No AI reply field found. Raw response:<br>
              <pre style="white-space:pre-wrap;font-size:13px;color:#333;">
${JSON.stringify(data, null, 2)}
              </pre>
            </div>`;
        }
      } catch (err) {
        actorsDiv.innerHTML = `
          <div style="padding:15px;color:#c0392b;">
            ❌ Error generating report: ${err.message}
          </div>`;
      }

      startBtn.disabled = false;
      startBtn.textContent = "▶ Start Compliance Check";
    });
  },
});
