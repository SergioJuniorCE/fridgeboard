'use client';

// On-device receipt prefill with Tesseract.js (lazy-loaded so the OCR engine
// stays out of the initial bundle). Best-effort: thermal receipts, glare, and
// folds defeat it regularly — the caller must let the user correct the total.
// First use needs internet to fetch the engine + language data.
export type ReceiptGuess = {
  total?: number;
  purchasedOn?: string;
};

function parseReceiptText(text: string): ReceiptGuess {
  const amounts = [...text.matchAll(/(\d{1,6}[.,]\d{2})/g)]
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100000);
  const total = amounts.length > 0 ? Math.max(...amounts) : undefined;
  const dateMatch =
    text.match(/(\d{4})-(\d{2})-(\d{2})/) ??
    text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  let purchasedOn: string | undefined;
  if (dateMatch) {
    if (dateMatch[0].includes('-') && dateMatch[1].length === 4) {
      purchasedOn = dateMatch[0];
    } else {
      const [, d, m, y] = dateMatch;
      const year = y.length === 2 ? `20${y}` : y;
      const cand = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      if (!Number.isNaN(new Date(cand).getTime())) purchasedOn = cand;
    }
  }
  return {total, purchasedOn};
}

export async function readReceiptPhoto(file: File): Promise<ReceiptGuess> {
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng');
  try {
    const {
      data: {text},
    } = await worker.recognize(file);
    return parseReceiptText(text ?? '');
  } finally {
    await worker.terminate();
  }
}
