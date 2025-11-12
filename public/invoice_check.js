/**
* AIVS Invoice Compliance Checker · Frontend Logic
 * ISO Timestamp: 2025-11-12T08:00:00Z
 * ISO Timestamp: 2025-11-12T09:45:00Z
* Author: AIVS Software Limited
* Brand Colour: #4e65ac
* Description:
 * Adds upload lock — user must press Clear before next upload.
 * Adds upload lock — user must press Clear before next upload,
 * hides uploader when report arrives, shows framed summary box.
*/

Dropzone.autoDiscover = false;

let uploadAllowed = true; // ✅ upload gatekeeper

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
const dzElement = document.getElementById("invoiceDrop");
const actorsDiv = document.getElementById("actors");
const clearBtn = document.getElementById("clearResultsBtn");

    // ✅ create framed status box for uploader/parser
    const statusBox = document.createElement("div");
    statusBox.id = "uploadStatusBox";
    statusBox.style.cssText = `
      display:none;
      border:2px solid #4e65ac;
      background:#fff;
      color:#222;
      padding:12px 16px;
      margin-top:16px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      font-size:14px;
      font-weight:500;
      box-shadow:0 2px 4px rgba(0,0,0,0.08);
      line-height:1.4;
    `;
    dzElement.parentNode.insertBefore(statusBox, actorsDiv);

// hide Clear button at page load
clearBtn.style.display = "none";

// --- Clear Results button logic -------------------------------------
clearBtn.addEventListener("click", () => {
actorsDiv.innerHTML = "";               // Clear report output
dzInstance.removeAllFiles(true);        // Remove uploaded file
const overlay = document.getElementById("uploadOverlay");
if (overlay) overlay.innerHTML = "📄 Drop or click to upload invoice";
clearBtn.style.display = "none";        // Hide button again
uploadAllowed = true;                   // ✅ re-enable upload
      dzElement.style.display = "block";      // ✅ bring uploader back
      statusBox.style.display = "none";       // ✅ hide summary frame
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

// ✅ Small transient warning message element
const warn = document.createElement("div");
warn.id = "uploadWarning";
warn.style.cssText = `
     position:absolute;
     bottom:4px;
     width:100%;
     text-align:center;
     color:#c0392b;
     font-size:13px;
     font-weight:600;
     opacity:0;
     transition:opacity 0.4s ease;
     pointer-events:none;
   `;
dzElement.appendChild(warn);

function showWarning(msg) {
warn.textContent = msg;
warn.style.opacity = "1";
setTimeout(() => (warn.style.opacity = "0"), 2500);
}

// ✅ Upload lock — block new uploads until Clear is pressed
dzInstance.on("addedfile", function (file) {
if (!uploadAllowed) {
dzInstance.removeFile(file);
showWarning("Please clear results before uploading a new invoice.");
return false;
}
});

// ---- sending (start upload) ----------------------------------------
dzInstance.on("sending", (file, xhr, formData) => {
overlay.innerHTML = `⏳ Uploading<br>${file.name}`;
formData.append("vatCategory", document.getElementById("vatCategory").value);
formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
formData.append("cisRate", document.getElementById("cisRate").value);
// --- include email addresses for backend Mailjet send ---------------
formData.append("userEmail", document.getElementById("userEmail").value);
formData.append("emailCopy1", document.getElementById("emailCopy1").value);
formData.append("emailCopy2", document.getElementById("emailCopy2").value);
});

// ---- success --------------------------------------------------------
dzInstance.on("success", (file, response) => {
      overlay.innerHTML = `
        <div><strong style="color:#4e65ac;">Uploader:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">Parser:</strong> ${
      // ✅ show framed summary instead of keeping overlay
      statusBox.innerHTML = `
        <div><strong style="color:#4e65ac;">UPLOADER:</strong> ${file.name}</div>
        <div><strong style="color:#4e65ac;">PARSER:</strong> ${
         response.parserNote || "Invoice parsed successfully."
       }</div>
     `;
      statusBox.style.display = "block";  // show summary frame
      dzElement.style.display = "none";   // hide Dropzone

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
               text-transform:uppercase;
             ">
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

clearBtn.style.display = "inline-block"; // ✅ show Clear
      uploadAllowed = false; // ✅ lock until cleared
      uploadAllowed = false;                   // ✅ lock until cleared
});

dzInstance.on("error", (file, err) => {
overlay.innerHTML = `<span style="color:#c0392b;">❌ Upload failed – ${err}</span>`;
});

dzInstance.on("addedfile", () => {
if (dzInstance.files.length > 1) dzInstance.removeFile(dzInstance.files[0]);
});
},
});

// (Optional) Disable manual email button entirely if it's still in HTML
// const sendEmailBtn = document.getElementById("sendEmailBtn");
// if (sendEmailBtn) sendEmailBtn.style.display = "none";
