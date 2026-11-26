// Prepares label images and recognizes them one at a time with Tesseract.js.
console.log("ocr.js loaded");

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
