import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import JSZip from "jszip";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { BrandProfile, Lead } from "./types";

export interface LetterPayload {
  leadId: string;
  companyName: string;
  decisionMaker: string;
  postalAddress: string;
  city: string;
  subject: string;
  body: string;
  dateLabel?: string;
}

const MM_TO_PT = 72 / 25.4;
const mm = (val: number) => val * MM_TO_PT;

const A4_WIDTH_PT = mm(210);
const A4_HEIGHT_PT = mm(297);

let cachedAssets: Promise<{
  logoBytes: Buffer;
  regularFontBytes: Buffer;
  boldFontBytes: Buffer;
}> | null = null;

async function loadLetterAssets() {
  if (!cachedAssets) {
    const base = path.join(process.cwd(), "src", "assets");
    cachedAssets = Promise.all([
      readFile(path.join(base, "linkify-logo.png")),
      readFile(path.join(base, "Figtree-Regular.ttf")),
      readFile(path.join(base, "Figtree-Bold.ttf")),
    ]).then(([logoBytes, regularFontBytes, boldFontBytes]) => ({
      logoBytes,
      regularFontBytes,
      boldFontBytes,
    }));
  }
  return cachedAssets;
}

export function formatGermanLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function splitSenderAddress(brand: BrandProfile): {
  company: string;
  owner: string;
  street: string;
  zipCity: string;
  phone: string;
  email: string;
  website: string;
  city: string;
} {
  const parts = brand.postal_address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const street = parts[0] || "Marktstraße 34C";
  const zipCity = parts[1] || `99084 ${brand.city || "Erfurt"}`;
  const website = brand.website_url
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  return {
    company: brand.brand_name || "Digitalagentur Linkify",
    owner: brand.owner_name || "Luis Schleicherdt",
    street,
    zipCity,
    phone: brand.phone_mobile || "+49 155 63477504",
    email: brand.contact_email || "info@linkify.tech",
    website: website || "www.linkify.tech",
    city: brand.city || "Erfurt",
  };
}

export function buildRecipientLines(letter: LetterPayload): string[] {
  const lines: string[] = [letter.companyName.trim()];

  const dm = letter.decisionMaker.trim();
  if (dm) {
    if (/^(herr|frau|z\.\s*hd\.)/i.test(dm)) {
      lines.push(
        /^z\.\s*hd\./i.test(dm)
          ? dm
          : /^herr\b/i.test(dm)
            ? `z. Hd. ${dm.replace(/^herr\b/i, "Herrn")}`
            : `z. Hd. ${dm}`,
      );
    } else {
      lines.push(`z. Hd. ${dm}`);
    }
  }

  const addr = letter.postalAddress.trim();
  if (addr) {
    // Strip leading duplicated company name if present (e.g. "Firma GmbH, Straße 1, 99084 Erfurt")
    const parts = addr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (
      parts.length >= 2 &&
      parts[0].toLowerCase().includes(letter.companyName.trim().toLowerCase().slice(0, 10))
    ) {
      parts.shift();
    }
    for (const part of parts) {
      lines.push(part);
    }
  } else if (letter.city.trim()) {
    lines.push(letter.city.trim());
  }

  return lines.slice(0, 5);
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function renderLetterPage(params: {
  pdf: PDFDocument;
  logo: PDFImage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  brand: BrandProfile;
  letter: LetterPayload;
}) {
  const { pdf, logo, regularFont, boldFont, brand, letter } = params;
  const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  const sender = splitSenderAddress(brand);
  const dateLabel = letter.dateLabel || formatGermanLongDate();

  const textDark = rgb(0.1, 0.1, 0.18);
  const textMuted = rgb(0.38, 0.42, 0.48);
  const markColor = rgb(0.7, 0.72, 0.76);

  // DIN 5008-B Fold & Punch Marks on left paper edge
  for (const mmFromTop of [87, 148.5, 192]) {
    const yMark = A4_HEIGHT_PT - mm(mmFromTop);
    page.drawLine({
      start: { x: 0, y: yMark },
      end: { x: mm(4.5), y: yMark },
      thickness: 0.5,
      color: markColor,
    });
  }

  // Top-left Linkify Logo (proportional height from 1011x301)
  const logoWidth = mm(38);
  const logoHeight = logoWidth * (logo.height / logo.width);
  page.drawImage(logo, {
    x: mm(25),
    y: A4_HEIGHT_PT - mm(14) - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  // Left Address Window (starts ~45mm from top)
  const leftX = mm(25);
  const returnLine = `${sender.company} · ${sender.owner} · ${sender.street} · ${sender.zipCity}`;
  page.drawText(returnLine, {
    x: leftX,
    y: A4_HEIGHT_PT - mm(45),
    size: 7.5,
    font: regularFont,
    color: textMuted,
  });

  const recipientLines = buildRecipientLines(letter);
  let recY = A4_HEIGHT_PT - mm(53);
  for (const line of recipientLines) {
    page.drawText(line, {
      x: leftX,
      y: recY,
      size: 10,
      font: regularFont,
      color: textDark,
    });
    recY -= 14;
  }

  // Right Sender Info Block (x: 125mm)
  const rightX = mm(125);
  let infoY = A4_HEIGHT_PT - mm(45);
  const rightRows: Array<{ text: string; gapAfter: number }> = [
    { text: `${sender.owner} - ${sender.company}`, gapAfter: 20 },
    { text: sender.street, gapAfter: 13 },
    { text: sender.zipCity, gapAfter: 20 },
    { text: sender.phone, gapAfter: 13 },
    { text: sender.email, gapAfter: 13 },
    { text: sender.website, gapAfter: 22 },
    { text: `${sender.city}, ${dateLabel}`, gapAfter: 0 },
  ];
  for (const row of rightRows) {
    page.drawText(row.text, {
      x: rightX,
      y: infoY,
      size: 9.5,
      font: regularFont,
      color: textDark,
    });
    infoY -= row.gapAfter;
  }

  // Subject & Body (~102mm from top)
  const maxBodyWidth = mm(165);
  let cursorY = A4_HEIGHT_PT - mm(102);

  const subjectLines = wrapTextLines(
    letter.subject.trim() || `Neuer Internetauftritt für ${letter.companyName}`,
    boldFont,
    11,
    maxBodyWidth,
  );
  for (const sLine of subjectLines) {
    page.drawText(sLine, {
      x: leftX,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: textDark,
    });
    cursorY -= 15;
  }
  cursorY -= 12;

  // Normalize line endings and clean any leftover internal markdown
  const cleanBody = letter.body
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();

  const paragraphs = cleanBody.split(/\n{2,}/);
  const fontSize = 10;
  const lineHeight = 14.2;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // Preserve explicit line breaks inside closing or signature blocks
    const subLines = trimmedPara.split("\n");
    for (const sub of subLines) {
      const wrapped = wrapTextLines(sub.trim(), regularFont, fontSize, maxBodyWidth);
      for (const wLine of wrapped) {
        if (cursorY < mm(32)) break;
        page.drawText(wLine, {
          x: leftX,
          y: cursorY,
          size: fontSize,
          font: regularFont,
          color: textDark,
        });
        cursorY -= lineHeight;
      }
    }

    // Larger gap after "Mit freundlichen Grüßen" for signature readability
    if (/^mit freundlichen grüßen/i.test(trimmedPara)) {
      cursorY -= 20;
    } else {
      cursorY -= 8;
    }
  }

  // Footer ("Seite 1 von 1" + 2-column business footer)
  const pageLabel = "Seite 1 von 1";
  const pageLabelW = regularFont.widthOfTextAtSize(pageLabel, 8);
  page.drawText(pageLabel, {
    x: A4_WIDTH_PT - mm(20) - pageLabelW,
    y: mm(27),
    size: 8,
    font: regularFont,
    color: textMuted,
  });

  const footerCol1 = [sender.company, sender.street, sender.zipCity];
  const footerCol2 = [
    `Inhaber: ${sender.owner}`,
    `Tel.: ${sender.phone}`,
    `Mail: ${sender.email}`,
  ];
  let fy = mm(19);
  for (let idx = 0; idx < 3; idx++) {
    page.drawText(footerCol1[idx], {
      x: leftX,
      y: fy,
      size: 8,
      font: regularFont,
      color: textMuted,
    });
    page.drawText(footerCol2[idx], {
      x: mm(68),
      y: fy,
      size: 8,
      font: regularFont,
      color: textMuted,
    });
    fy -= 10.5;
  }
}

export async function buildBatchLetterPdfBuffer(
  brand: BrandProfile,
  letters: LetterPayload[],
): Promise<Uint8Array> {
  const { logoBytes, regularFontBytes, boldFontBytes } =
    await loadLetterAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const [logo, regularFont, boldFont] = await Promise.all([
    pdf.embedPng(logoBytes),
    pdf.embedFont(regularFontBytes),
    pdf.embedFont(boldFontBytes),
  ]);

  for (const letter of letters) {
    renderLetterPage({
      pdf,
      logo,
      regularFont,
      boldFont,
      brand,
      letter,
    });
  }

  return pdf.save();
}

export async function buildLetterDocxBuffer(
  brand: BrandProfile,
  letter: LetterPayload,
): Promise<Buffer> {
  const { logoBytes } = await loadLetterAssets();
  const sender = splitSenderAddress(brand);
  const dateLabel = letter.dateLabel || formatGermanLongDate();
  const recipientLines = buildRecipientLines(letter);

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const cellNoBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const cleanBody = letter.body
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();

  const bodyParagraphs: Paragraph[] = cleanBody
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const isClosing = /^mit freundlichen grüßen/i.test(p.trim());
      return new Paragraph({
        spacing: {
          after: isClosing ? 360 : 160,
          line: 320,
        },
        children: p
          .trim()
          .split("\n")
          .flatMap((line, idx) =>
            idx === 0
              ? [new TextRun({ text: line.trim(), size: 20, font: "Figtree" })]
              : [
                  new TextRun({
                    text: line.trim(),
                    size: 20,
                    font: "Figtree",
                    break: 1,
                  }),
                ],
          ),
      });
    });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906, // 210mm A4
              height: 16838, // 297mm A4
            },
            margin: {
              top: 794, // ~14mm
              left: 1417, // 25mm DIN 5008-B
              right: 1134, // 20mm
              bottom: 1100,
              header: 450,
              footer: 450,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                spacing: { after: 220 },
                children: [
                  new ImageRun({
                    data: logoBytes,
                    type: "png",
                    transformation: {
                      width: 144,
                      height: 43,
                    },
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 100 },
                children: [
                  new TextRun({
                    text: "Seite 1 von 1",
                    size: 16,
                    color: "555555",
                    font: "Figtree",
                  }),
                ],
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 32, type: WidthType.PERCENTAGE },
                        borders: cellNoBorder,
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: sender.company,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                              }),
                              new TextRun({
                                text: sender.street,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                                break: 1,
                              }),
                              new TextRun({
                                text: sender.zipCity,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                                break: 1,
                              }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        width: { size: 68, type: WidthType.PERCENTAGE },
                        borders: cellNoBorder,
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `Inhaber: ${sender.owner}`,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                              }),
                              new TextRun({
                                text: `Tel.: ${sender.phone}`,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                                break: 1,
                              }),
                              new TextRun({
                                text: `Mail: ${sender.email}`,
                                size: 16,
                                color: "555555",
                                font: "Figtree",
                                break: 1,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ spacing: { after: 360 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 58, type: WidthType.PERCENTAGE },
                    borders: cellNoBorder,
                    children: [
                      new Paragraph({
                        spacing: { after: 180 },
                        children: [
                          new TextRun({
                            text: `${sender.company} · ${sender.owner} · ${sender.street} · ${sender.zipCity}`,
                            size: 15,
                            color: "555555",
                            font: "Figtree",
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { line: 300 },
                        children: recipientLines.flatMap((line, idx) =>
                          idx === 0
                            ? [
                                new TextRun({
                                  text: line,
                                  size: 20,
                                  font: "Figtree",
                                }),
                              ]
                            : [
                                new TextRun({
                                  text: line,
                                  size: 20,
                                  font: "Figtree",
                                  break: 1,
                                }),
                              ],
                        ),
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 42, type: WidthType.PERCENTAGE },
                    borders: cellNoBorder,
                    children: [
                      new Paragraph({
                        spacing: { after: 160 },
                        children: [
                          new TextRun({
                            text: `${sender.owner} - ${sender.company}`,
                            size: 19,
                            font: "Figtree",
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { after: 160, line: 280 },
                        children: [
                          new TextRun({
                            text: sender.street,
                            size: 19,
                            font: "Figtree",
                          }),
                          new TextRun({
                            text: sender.zipCity,
                            size: 19,
                            font: "Figtree",
                            break: 1,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { after: 200, line: 280 },
                        children: [
                          new TextRun({
                            text: sender.phone,
                            size: 19,
                            font: "Figtree",
                          }),
                          new TextRun({
                            text: sender.email,
                            size: 19,
                            font: "Figtree",
                            break: 1,
                          }),
                          new TextRun({
                            text: sender.website,
                            size: 19,
                            font: "Figtree",
                            break: 1,
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${sender.city}, ${dateLabel}`,
                            size: 19,
                            font: "Figtree",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ spacing: { after: 440 } }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text:
                  letter.subject.trim() ||
                  `Neuer Internetauftritt für ${letter.companyName}`,
                bold: true,
                size: 22,
                font: "Figtree",
              }),
            ],
          }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function safeFileSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "Linkify-Brief"
  );
}

export async function buildLettersZipBuffer(
  brand: BrandProfile,
  letters: LetterPayload[],
): Promise<Buffer> {
  const zip = new JSZip();

  if (letters.length > 1) {
    const batchPdf = await buildBatchLetterPdfBuffer(brand, letters);
    zip.file("00_SAMMELDRUCK_Alle-Briefe.pdf", batchPdf);
  }

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const prefix = String(i + 1).padStart(2, "0");
    const slug = safeFileSlug(letter.companyName);

    const [pdfBytes, docxBytes] = await Promise.all([
      buildBatchLetterPdfBuffer(brand, [letter]),
      buildLetterDocxBuffer(brand, letter),
    ]);

    zip.file(`PDF/${prefix}_${slug}_Brief.pdf`, pdfBytes);
    zip.file(`Pages_DOCX/${prefix}_${slug}_Brief.docx`, docxBytes);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export function leadToLetterPayload(
  lead: Lead,
  subject: string,
  body: string,
): LetterPayload {
  return {
    leadId: lead.id,
    companyName: lead.company_name,
    decisionMaker: lead.decision_maker,
    postalAddress: lead.postal_address,
    city: lead.city,
    subject,
    body,
  };
}
