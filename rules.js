// Loads declarative checks and evaluates extracted label fields.
console.log("rules.js loaded");

const LabelRules = (() => {
  const DEFAULT_CONFIDENCE_THRESHOLD = 45;
  let configPromise;

  function loadRules() {
    if (!configPromise) {
      configPromise = fetch("rules.json")
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load rules.json (${response.status}).`);
          return response.json();
        })
        .then((config) => {
          if (!Array.isArray(config.rules)) throw new Error("rules.json must contain a rules array.");
          return config;
        })
        .catch((error) => {
          configPromise = null;
          throw error;
        });
    }
    return configPromise;
  }

  async function evaluateFields(fields, confidence, threshold) {
    const config = await loadRules();
    const findings = config.rules.map((rule) => {
      const value = fields[rule.field];
      const present = value !== null && value !== undefined && String(value).trim() !== "";
      if (!present) {
        return { id: rule.id, field: rule.field, value: null, required: rule.required, status: rule.required ? "MISSING" : "PASS", reason: rule.required ? rule.errorMessage : "Optional declaration was not detected.", reference: rule.reference };
      }
      let valid = false;
      try {
        valid = new RegExp(rule.pattern, rule.flags || "i").test(String(value));
      } catch (error) {
        return { id: rule.id, field: rule.field, value, required: rule.required, status: "FAIL", reason: `Invalid validation pattern in rules.json: ${error.message}`, reference: rule.reference };
      }
      return {
        id: rule.id, field: rule.field, value, required: rule.required,
        status: valid ? "PASS" : "FAIL",
        reason: valid ? "Declaration detected and matches the configured format." : rule.errorMessage,
        reference: rule.reference
      };
    });
    const confidenceThreshold = Number.isFinite(threshold) ? threshold : (config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
    const lowConfidence = Number.isFinite(confidence) && confidence < confidenceThreshold;
    const hasRequiredFailure = findings.some((finding) => finding.required && finding.status !== "PASS");
    const verdict = lowConfidence ? "NEEDS REVIEW" : hasRequiredFailure ? "NON-COMPLIANT" : "COMPLIANT";
    return { verdict, findings, confidenceThreshold, lowConfidence };
  }

  return { loadRules, evaluateFields };
})();
