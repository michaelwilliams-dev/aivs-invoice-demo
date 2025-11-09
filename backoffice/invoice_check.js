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
	init: function() {
	  this.on("sending", function(file, xhr, formData) {
		// Append user selections from preQuestions form
		formData.append("vatCategory", document.getElementById("vatCategory").value);
		formData.append("endUserConfirmed", document.getElementById("endUserConfirmed").value);
		formData.append("cisRate", document.getElementById("cisRate").value);
	  });
  
	  this.on("success", (file, response) => {
		const actorsDiv = document.getElementById("actors");
		actorsDiv.innerHTML = `
		  <div class="actor"><span>Uploader:</span> ${file.name}</div>
		  <div class="actor"><span>Parser:</span> ${response.parserNote}</div>
		  <div class="actor"><span>AI Validator:</span><br>${response.aiReply}</div>
		  <div class="actor"><span>Response Time:</span> ${response.timestamp || "—"}</div>
		`;
	  });
  
	  this.on("error", (file, err) => alert("Upload failed: " + err));
	}
  };