// CSV ground-truth parsing and extractor comparison metrics.
console.log("report.js loaded");

const LabelReport = (() => {
  const FIELDS = ["commodityName", "netQuantity", "mrp", "manufacturerPackerImporter", "manufacturePackingImportDate", "consumerCare", "countryOfOrigin"];
  const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase();

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const headers = (rows.shift() || []).map((header) => header.trim());
    return rows.filter((line) => line.some((value) => value.trim())).map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] || ""])));
  }

  function fieldScore(actual, truth) {
    const keys = Object.keys(truth).filter((key) => FIELDS.includes(key) && String(truth[key]).trim() !== "");
    let correct = 0;
    keys.forEach((key) => { if (normalize(actual[key]) === normalize(truth[key])) correct += 1; });
    return { correct, total: keys.length };
  }
  function percent(correct, total) { return total ? Math.round(100 * correct / total) : null; }

  // Supply more named extractor functions to compare future implementations side by side.
  function compare(groundTruth, predictions, extractors = { "Regex baseline": (item) => item.fields }) {
    const byName = new Map(predictions.map((item) => [normalize(item.image_name || item.file?.name), item]));
    const output = {};
    Object.entries(extractors).forEach(([name, extractor]) => {
      let fieldCorrect = 0, fieldTotal = 0, decisionCorrect = 0, decisionTotal = 0, compliantFlagged = 0, compliantTotal = 0;
      const perField = Object.fromEntries(FIELDS.map((field) => [field, { correct: 0, total: 0 }]));
      groundTruth.forEach((truth) => {
        const prediction = byName.get(normalize(truth.image_name));
        if (!prediction) return;
        const actual = extractor(prediction) || {};
        FIELDS.forEach((field) => {
          if (String(truth[field] ?? "").trim() === "") return;
          perField[field].total += 1; fieldTotal += 1;
          if (normalize(actual[field]) === normalize(truth[field])) { perField[field].correct += 1; fieldCorrect += 1; }
        });
        if (truth.true_verdict) {
          decisionTotal += 1;
          if (normalize(actual.verdict).replace(/-/g, " ") === normalize(truth.true_verdict).replace(/-/g, " ")) decisionCorrect += 1;
          if (normalize(truth.true_verdict) === "compliant") {
            compliantTotal += 1;
            if (normalize(actual.verdict) === "non-compliant") compliantFlagged += 1;
          }
        }
      });
      output[name] = {
        fieldAccuracy: percent(fieldCorrect, fieldTotal),
        perField: Object.fromEntries(FIELDS.map((field) => [field, percent(perField[field].correct, perField[field].total)])),
        ruleDecisionAccuracy: percent(decisionCorrect, decisionTotal),
        falseFlagRate: percent(compliantFlagged, compliantTotal)
      };
    });
    return output;
  }
  function quoteCSV(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCSV(results) {
    const headers = ["image_name", ...FIELDS, "confidence", "verdict", "findings"];
    const rows = results.map((item) => [item.file?.name || item.image_name, ...FIELDS.map((field) => item.fields?.[field]), item.confidence, item.verdict,
      (item.findings || []).map((finding) => `${finding.field} ${finding.status}: ${finding.reason}`).join(" | ")]);
    download("label-check-results.csv", [headers, ...rows].map((line) => line.map(quoteCSV).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function exportJSON(results, metrics = {}) {
    download("label-check-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), metrics, results }, null, 2), "application/json");
  }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
  function openPrintReport(results, metrics = {}) {
    const count = (verdict) => results.filter((item) => item.verdict === verdict).length;
    const summary = { total: results.length, compliant: count("COMPLIANT"), nonCompliant: count("NON-COMPLIANT"), review: count("NEEDS REVIEW") };
    const rate = (n) => summary.total ? `${Math.round(n * 100 / summary.total)}%` : "0%";
    const missing = {};
    results.forEach((item) => (item.findings || []).filter((finding) => finding.status === "MISSING").forEach((finding) => { missing[finding.field] = (missing[finding.field] || 0) + 1; }));
    const commonMissing = Object.entries(missing).sort((a, b) => b[1] - a[1]).map(([field, n]) => `<li>${escapeHTML(field)}: ${n}</li>`).join("") || "<li>None recorded</li>";
    const metricRows = Object.entries(metrics).map(([name, value]) => `<li>${escapeHTML(name)}: ${escapeHTML(value)}</li>`).join("") || "<li>No ground-truth metrics available</li>";
    const imageRows = results.map((item) => `<section class="label"><h3>${escapeHTML(item.file?.name || item.image_name)} · ${escapeHTML(item.verdict || "NEEDS REVIEW")}</h3><p>Confidence: ${escapeHTML(item.confidence)}%</p><ul>${(item.findings || []).map((f) => `<li><b>${escapeHTML(f.field)} — ${escapeHTML(f.status)}:</b> ${escapeHTML(f.reason)}${f.reference ? ` <small>(${escapeHTML(f.reference)})</small>` : ""}</li>`).join("") || "<li>No field findings recorded.</li>"}</ul></section>`).join("");
    const tab = window.open("", "_blank");
    if (!tab) { alert("Allow pop-ups to open the printable report."); return; }
    tab.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label compliance summary</title><style>body{font:14px Arial,sans-serif;color:#17243b;max-width:900px;margin:32px auto;padding:0 20px}h1{font-size:24px}.summary{display:flex;gap:20px;flex-wrap:wrap}.label{border-top:1px solid #bbb;padding:12px 0}.label h3{margin-bottom:4px}li{margin:5px 0}small{color:#666}@media print{body{max-width:none;margin:0;padding:0}.no-print{display:none}.label{break-inside:avoid}}</style></head><body><button class="no-print" onclick="window.print()">Print report</button><h1>Packaged-Label Compliance Summary</h1><p>Generated ${escapeHTML(new Date().toLocaleString())}</p><div class="summary"><span>Total images: ${summary.total}</span><span>Compliant: ${rate(summary.compliant)}</span><span>Non-compliant: ${rate(summary.nonCompliant)}</span><span>Needs review: ${rate(summary.review)}</span></div><h2>Most commonly missing fields</h2><ul>${commonMissing}</ul><h2>Metrics</h2><ul>${metricRows}</ul><h2>Per-image findings</h2>${imageRows}</body></html>`);
    tab.document.close();
  }
  return { FIELDS, parseCSV, compare, exportCSV, exportJSON, openPrintReport };
})();
