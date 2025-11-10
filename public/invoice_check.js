/**
 * AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-09T18:50:00Z
 * Author: AIVS Software Limited
 * Brand Colour: #4e65ac
 * Description:
 * Manages the drag-and-drop upload interface and sends
 * files + user flags to the /check_invoice backend route.
 */

Dropzone.options.invoiceDrop = {
  maxFilesize: 10,
  acceptedFiles: ".pdf,.jpg,.png,.json",
  init: function () {
    const dz = this;
    const actorsDiv = document.getElementById("actors");

    // Create Clear button (hidden by default)
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear Results";
    clearBtn.id = "clearResultsBtn";
    clearBtn.style.cssText = `
      background:#4e65ac;
      color:#fff;
      border:none;
      padding:12px 28px;
      border-radius:4px;
      cursor:pointer;
      display:none;
      float:right;
      margin-top:10px;
      font-size:16px;           /* slightly larger text */
      font-weight:600;          /* bolder text */
    `;
    actorsDiv.insertAdjacentElement("afterend", clearBtn);

    // Handle Clear button click
    clearBtn.addEventListener("click", () => {
      actorsDiv.innerHTML = "";
      dz.removeAllFiles(true); // clear Dropzone
      clearBtn.style.display = "none"; // hide again
    });

    this.on("sending", function (file, xhr, formData) {
      formData.append("vatCategory", document.getElementById("vatCategory").value);
      formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
      formData.append("cisRate", document.getElementById("cisRate").value);
    });

    this.on("success", (file, response) => {
      const v = response.aiReply;
      let formattedAIReply = "";

      /* ▼▼▼ CHANGE START — blue, smaller section headings ▼▼▼ */
      if (typeof v === "object" && v !== null) {
        formattedAIReply = `
          <div class="ai-section">
            <h3 style="color:#4e65ac;font-size:15px;font-weight:600;">VAT / DRC Check</h3><p>${v.vat_check || "—"}</p>
          </div>
          <div class="ai-section">
            <h3 style="color:#4e65ac;font-size:15px;font-weight:600;">CIS Check</h3><p>${v.cis_check || "—"}</p>
          </div>
          <div class="ai-section">
            <h3 style="color:#4e65ac;font-size:15px;font-weight:600;">Required Wording</h3><p>${v.required_wording || "—"}</p>
          </div>
          <div class="ai-section">
            <h3 style="color:#4e65ac;font-size:15px;font-weight:600;">Corrected Invoice</h3><div>${v.corrected_invoice || "—"}</div>
          </div>
          <div class="ai-section">
            <h3 style="color:#4e65ac;font-size:15px;font-weight:600;">Summary</h3><p>${v.summary || "—"}</p>
          </div>`;
      } else {
        formattedAIReply = v || "No AI response.";
      }
      /* ▲▲▲ CHANGE END — blue, smaller section headings ▲▲▲ */

      actorsDiv.innerHTML = `
        <div class="actor"><span>Uploader:</span> ${file.name}</div>
        <div class="actor"><span>Parser:</span> ${response.parserNote}</div>
        <div class="actor"><span>AI Validator:</span><br>${formattedAIReply}</div>
        <div class="actor"><span>Response Time:</span> ${response.timestamp || "—"}</div>
      `;

      // Show Clear button now that results exist
      clearBtn.style.display = "inline-block";
    });

    this.on("error", (file, err) => alert("Upload failed: " + err));
  },
};
