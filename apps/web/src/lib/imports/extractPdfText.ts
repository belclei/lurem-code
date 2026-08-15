// apps/web/src/lib/imports/extractPdfText.ts
// ARQUITETURA.md §6.8 — o PDF nunca sai do dispositivo: texto e hash são
// calculados aqui, no navegador; só o texto (nunca o arquivo) sobe pro
// servidor, de passagem, para a extração via LLM (apps/api/src/imports).
//
// A spec original (§6.8) fala em "markitdown" — essa é a ferramenta usada
// no precedente (money-flow), mas markitdown é uma lib Python, sem porte
// oficial pra rodar no navegador. pdf.js (pdfjs-dist) é a alternativa
// nativa do browser que cumpre a mesma exigência central da spec (extração
// 100% client-side, PDF nunca sai do dispositivo) — troca de ferramenta,
// não de decisão de arquitetura.
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export class PdfPasswordRequiredError extends Error {
  constructor() {
    super("PDF protegido por senha.");
    this.name = "PdfPasswordRequiredError";
  }
}

export class PdfNoTextLayerError extends Error {
  constructor() {
    super(
      "Não encontramos texto neste PDF — provavelmente é uma imagem escaneada.",
    );
    this.name = "PdfNoTextLayerError";
  }
}

/** Extracts every page's text, one "## Page N" markdown section per page —
 * same shape the LLM prompt (apps/api/src/imports/extractor.ts) expects,
 * mirroring the money-flow precedent's pdfplumber fallback formatting. */
export async function extractPdfText(
  file: File,
  password?: string,
): Promise<string> {
  const buffer = await file.arrayBuffer();

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await pdfjsLib.getDocument({
      data: buffer,
      password,
    }).promise;
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("password")) {
      throw new PdfPasswordRequiredError();
    }
    throw err;
  }

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (text) pages.push(`## Page ${i}\n\n${text}`);
  }

  if (pages.length === 0) {
    throw new PdfNoTextLayerError();
  }

  return pages.join("\n\n");
}

/** SHA-256 of the raw file bytes, via the browser's own Web Crypto — same
 * dedup key the API compares against (ImportedDocument.contentHash), so
 * re-uploading the identical file is recognized without re-sending it. */
export async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
