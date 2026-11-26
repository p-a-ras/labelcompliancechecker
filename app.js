// Handles image selection and starts the sequential OCR pass.
console.log("app.js loaded");

const imageInput = document.getElementById("image-input");
const dropzone = document.getElementById("dropzone");
const browseButton = document.getElementById("browse-button");
const previewGrid = document.getElementById("preview-grid");
const previewHeading = document.getElementById("preview-heading");
const fileCount = document.getElementById("file-count");
const runButton = document.getElementById("run-button");
const runCaption = document.getElementById("run-caption");
const clearButton = document.getElementById("clear-button");
const uploadError = document.getElementById("upload-error");
const progressTrack = document.querySelector(".progress-track");
const progressFill = progressTrack.querySelector("span");
const resultsBody = document.getElementById("results-body");
const resultFooter = document.querySelector(".table-footer span:first-child");

let selectedFiles = [];
let isRunning = false;

function isSupportedImage(file) {
  return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
}

function addFiles(fileList) {
  const incoming = Array.from(fileList);
  const valid = incoming.filter(isSupportedImage);
  const rejected = incoming.length - valid.length;
  selectedFiles = selectedFiles.concat(valid);
  uploadError.hidden = rejected === 0;
  uploadError.textContent = rejected ? `${rejected} unsupported file${rejected === 1 ? " was" : "s were"} skipped. Choose JPG or PNG images.` : "";
  renderPreviews();
}

function renderPreviews() {
  previewGrid.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "preview-card";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = `Preview of ${file.name}`;
    image.onload = () => URL.revokeObjectURL(image.src);
    const name = document.createElement("span");
    name.className = "preview-card-name";
    name.textContent = file.name;
    const remove = document.createElement("button");
    remove.className = "preview-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderPreviews();
    });
    card.append(image, name, remove);
    previewGrid.append(card);
  });

  fileCount.textContent = `${selectedFiles.length} ${selectedFiles.length === 1 ? "image" : "images"}`;
  previewHeading.hidden = selectedFiles.length === 0;
  runButton.disabled = selectedFiles.length === 0 || isRunning;
  runCaption.textContent = selectedFiles.length ? `${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"} ready to process` : "Add images to get started";
}

function makeCell(content, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.append(content);
  return cell;
}

function renderResults(results) {
  resultsBody.replaceChildren();
  results.forEach(({ file, rawText, confidence, error }) => {
    const row = document.createElement("tr");
    row.className = "result-row";

    const imageCell = document.createElement("div");
    imageCell.className = "image-cell";
    const name = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = file.name;
    const small = document.createElement("small");
    small.textContent = `${Math.round(file.size / 1024)} KB`;
    name.append(strong, small);
    imageCell.append(name);
    row.append(makeCell(imageCell));

    const ocrCell = document.createElement("div");
    ocrCell.className = "ocr-cell";
    const confidenceLine = document.createElement("span");
    confidenceLine.className = "ocr-confidence";
    confidenceLine.textContent = error ? "Unreadable image · 0% confidence" : `Confidence · ${confidence}%`;
    const snippet = document.createElement("pre");
    snippet.className = "ocr-snippet";
    snippet.textContent = rawText || (error ? "Could not read this image." : "No text detected.");
    ocrCell.append(confidenceLine, snippet);
    row.append(makeCell(ocrCell));

    const verdict = document.createElement("span");
    verdict.className = "badge badge-review";
    verdict.innerHTML = "<i></i> NEEDS REVIEW";
    row.append(makeCell(verdict));

    const detailsCell = document.createElement("td");
    const details = document.createElement("details");
    details.className = "finding-details";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "Show raw OCR text");
    const content = document.createElement("div");
    content.className = "finding-popover";
    const heading = document.createElement("strong");
    heading.textContent = "Raw OCR text";
    const fullText = document.createElement("pre");
    fullText.className = "ocr-full-text";
    fullText.textContent = rawText || (error ? `Unreadable image: ${error}` : "No text detected.");
    content.append(heading, fullText);
    details.append(summary, content);
    detailsCell.append(details);
    row.append(detailsCell);
    resultsBody.append(row);
  });
  resultFooter.textContent = `${results.length} image${results.length === 1 ? "" : "s"} processed · OCR results only`;
}

browseButton.addEventListener("click", () => imageInput.click());
dropzone.addEventListener("click", (event) => {
  if (event.target !== browseButton) imageInput.click();
});
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    imageInput.click();
  }
});
imageInput.addEventListener("change", () => {
  addFiles(imageInput.files);
  imageInput.value = "";
});
clearButton.addEventListener("click", () => {
  selectedFiles = [];
  uploadError.hidden = true;
  renderPreviews();
});
[
  ["dragenter", "dragover"],
  ["dragleave", "drop"]
].forEach(([enterEvent, leaveEvent]) => {
  dropzone.addEventListener(enterEvent, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener(leaveEvent, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  });
});
dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

runButton.addEventListener("click", async () => {
  if (!selectedFiles.length || isRunning) return;
  isRunning = true;
  renderPreviews();
  uploadError.hidden = true;
  progressFill.style.width = "0%";
  progressTrack.setAttribute("aria-valuenow", "0");
  runCaption.textContent = "Preparing OCR…";
  try {
    const results = await LabelOCR.recognizeImages(selectedFiles, (progress) => {
      progressFill.style.width = `${progress.percent}%`;
      progressTrack.setAttribute("aria-valuenow", String(progress.percent));
      runCaption.textContent = `Reading ${progress.file.name} · ${progress.completed} of ${progress.total}`;
    });
    renderResults(results);
    runCaption.textContent = "OCR complete · Review extracted text below";
  } catch (error) {
    uploadError.textContent = error.message || "OCR could not start. Please try again.";
    uploadError.hidden = false;
    runCaption.textContent = "OCR could not start";
  } finally {
    isRunning = false;
    renderPreviews();
  }
});

renderPreviews();
