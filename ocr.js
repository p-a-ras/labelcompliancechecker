// Prepares label images and recognizes them one at a time with Tesseract.js.
console.log("ocr.js loaded");

// OCR-friendly patterns allow whitespace and common letter/digit substitutions.
function extractFields(text) {
  const source = String(text || "").replace(/[\u00a0\t]+/g, " ");
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || null;
  const capture = (pattern, input = source) => {
    const match = input.match(pattern);
    return match ? match[1].trim().replace(/[|]+$/g, "").trim() || null : null;
  };
  const unit = "(?:kg|g|mg|ml|l|cl|n|pieces?)";

  const quantityLine = findLine(new RegExp(`\\b(?:net\\s*(?:qty|quantity)|quantity)\\b|\\b\\d[\\d.,]*\\s*${unit}\\b`, "i"));
  const quantity = capture(new RegExp(`((?:net\\s*(?:qty|quantity)\\s*[:.-]?\\s*)?\\d[\\d.,]*\\s*${unit}\\b)`, "i"), quantityLine || source);
  const mrpLine = findLine(/\b(?:m\s*\.?\s*r\s*\.?\s*p\.?|maximum\s*retail\s*price)\b/i);
  const mrp = capture(/((?:(?:m\s*\.?\s*r\s*\.?\s*p\.?|maximum\s*retail\s*price)\s*[:.-]?\s*)?(?:(?:rs\.?|r\s*s\.?|₹)\s*)?\d[\d,.]*(?:\s*\/-)?)/i, mrpLine || source);

  const commodityLine = findLine(/\b(?:commodity|product|common)\s*(?:name)?\s*[:.-]/i);
  const commodity = capture(/(?:commodity|product|common)\s*(?:name)?\s*[:.-]\s*(.+)/i, commodityLine || "") ||
    (lines.find((line) => /^[A-Z][A-Z0-9 &,'-]{2,40}$/.test(line) && !/^(MRP|INDIA|MADE IN)/i.test(line)) || null);

  const manufacturerLine = findLine(/\b(?:manufactured\s*by|manufacturer|packed\s*by|packer|imported\s*by|importer|mfd\.?\s*by|marketed\s*by)\b/i);
  let manufacturer = null;
  if (manufacturerLine) {
    manufacturer = manufacturerLine.replace(/^.*?\b(?:manufactured\s*by|manufacturer|packed\s*by|packer|imported\s*by|importer|mfd\.?\s*by|marketed\s*by)\b\s*[:.-]?\s*/i, "").trim() || null;
    const lineIndex = lines.indexOf(manufacturerLine);
    const addressLine = lines.slice(lineIndex + 1, lineIndex + 4).find((line) => /\b[0-9O]{6}\b/.test(line.replace(/[Oo]/g, "0")));
    if (addressLine && !/\b[0-9O]{6}\b/.test(manufacturer)) manufacturer = `${manufacturer}, ${addressLine}`;
  }
  const pinMatch = source.match(/\b(?:PIN\s*(?:CODE)?\s*[:.-]?\s*)?([0-9O]{6})\b/i);
  if (manufacturer && pinMatch && !manufacturer.replace(/[Oo]/g, "0").includes(pinMatch[1].replace(/[Oo]/g, "0"))) manufacturer += `, PIN ${pinMatch[1]}`;

  const dateLine = findLine(/\b(?:mfg|mfd|manufactur(?:e|ing)|packed|packing|import(?:ed|ation))\b/i);
  const monthYear = capture(/((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,./-]+(?:19|20)?\d{2}|(?:0?[1-9]|1[0-2])[\s./-](?:19|20)?\d{2})/i, dateLine || source);

  const careLine = findLine(/\b(?:consumer\s*care|customer\s*care|care\s* helpline|helpline|toll\s*free|contact)\b/i);
  const phone = capture(/((?:\+?91[\s-]?)?[0-9OIl][0-9OIl\s()-]{7,}[0-9OIl])/, careLine || source);
  const email = capture(/([\w.+-]+\s*@\s*[\w.-]+\.[a-z]{2,})/i, careLine || source);
  const careDetails = [phone, email].filter(Boolean).join(" · ") || (careLine ? careLine.replace(/^.*?\b(?:consumer\s*care|customer\s*care|care\s*helpline|helpline|toll\s*free|contact)\b\s*[:.-]?\s*/i, "").trim() || null : null);

  const originLine = findLine(/\b(?:country\s*of\s*origin|made\s*in|product\s*of)\b/i);
  const country = capture(/(?:country\s*of\s*origin|made\s*in|product\s*of)\s*[:.-]?\s*(.+)/i, originLine || "");
  return { commodityName: commodity, netQuantity: quantity, mrp, manufacturerPackerImporter: manufacturer, manufacturePackingImportDate: monthYear, consumerCare: careDetails, countryOfOrigin: country };
}

const sampleOCRTexts = [
  "Commodity: Green Tea\nNet Qty: 100 g\nMRP Rs. 180/-\nManufactured by: Leaf Foods, Pune 411001\nMfg: Jan 2025\nConsumer Care: 9876543210 care@example.in\nCountry of Origin: India",
  "COMMON NAME: Tomato Ketchup\nNet Quantity 500 ml\nM.R.P. ₹ 99\nPacked by Sunrise Kitchens\nPIN: 560001\nPacked: 02/2025\nHelpline 1800 123 4567\nMade in India",
  "Product Name - Almond Oil\nNet Qty 1 L\nMRP 245 /-\nImported by: Nature Trade, Mumbai PIN 400001\nImported: Mar 2024\nCustomer Care contact@nature.in\nProduct of Spain",
  "Commodity Name: Salt\nNet Quantity: 1 kg\nM R P Rs 30\nMfd by Pure Foods, Jaipur 302001\nManufacturing: 11-2024\nConsumer Care 9123456789\nMade in India",
  "DAILY OATS\nNet Qty: 250 g\nMRP: ₹120/-\nPacker: Grain House, Delhi PIN 110001\nPacking: Dec 2023\nToll Free: 1800-555-1212\nCountry of Origin: India"
];

function testExtractFields() {
  return sampleOCRTexts.map((sample, index) => ({ sample: index + 1, fields: extractFields(sample) }));
}
window.extractFields = extractFields;
window.sampleOCRTexts = sampleOCRTexts;
window.testExtractFields = testExtractFields;

const LabelOCR = (() => {
  const MINIMUM_DIMENSION = 1600;
  const MAXIMUM_DIMENSION = 3000;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The image could not be opened."));
      };
      image.src = url;
    });
  }

  async function preprocess(file) {
    const image = await loadImage(file);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestSide < MINIMUM_DIMENSION
      ? Math.min(MINIMUM_DIMENSION / longestSide, MAXIMUM_DIMENSION / longestSide)
      : Math.min(1, MAXIMUM_DIMENSION / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas processing is unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const contrast = 1.35;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
      const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
      pixels.data[i] = enhanced;
      pixels.data[i + 1] = enhanced;
      pixels.data[i + 2] = enhanced;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  async function recognizeImages(files, onProgress = () => {}) {
    const results = [];
    const total = files.length;
    if (!total) return results;

    if (!window.Tesseract) throw new Error("Tesseract.js did not load. Check your internet connection and reload.");

    let worker;
    try {
      worker = await Tesseract.createWorker("eng", 1);
      for (let index = 0; index < total; index += 1) {
        const file = files[index];
        let result = { rawText: "", confidence: 0 };
        try {
          const imageCanvas = await preprocess(file);
          const recognition = await worker.recognize(imageCanvas);
          result = {
            rawText: (recognition.data.text || "").trim(),
            confidence: Number.isFinite(recognition.data.confidence)
              ? Math.round(recognition.data.confidence * 10) / 10
              : 0
          };
        } catch (error) {
          result.error = error.message || "This image could not be read.";
        }
        results.push({ file, ...result });
        onProgress({ completed: index + 1, total, percent: Math.round(((index + 1) / total) * 100), file });
        // Yield between labels so the page can paint progress and accept UI updates.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      if (worker) await worker.terminate();
    }
    return results;
  }

  return { recognizeImages };
})();
