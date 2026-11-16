import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
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
  const markColor = rgb(0.68, 0.7, 0.75);

  // Exact DIN 5008 Form B Fold & Punch Marks on left paper edge (105mm, 148.5mm, 210mm)
  for (const mmFromTop of [105, 148.5, 210]) {
    const yMark = A4_HEIGHT_PT - mm(mmFromTop);
    page.drawLine({
      start: { x: 0, y: yMark },
      end: { x: mm(5), y: yMark },
      thickness: 0.5,
      color: markColor,
    });
  }

  // Top-left Linkify Logo inside 45mm DIN 5008-B header zone
  const logoWidth = mm(38);
  const logoHeight = logoWidth * (logo.height / logo.width);
  page.drawImage(logo, {
    x: mm(25),
    y: A4_HEIGHT_PT - mm(14) - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  // DIN 5008-B Window Address Zone (left: 25mm, top: 45mm to 90mm, width: 85mm)
  const leftX = mm(25);
  const returnLine = `${sender.company} · ${sender.owner} · ${sender.street} · ${sender.zipCity}`;
  const returnY = A4_HEIGHT_PT - mm(57.5);
  let returnFontSize = 7.2;
  while (
    returnFontSize > 5.8 &&
    regularFont.widthOfTextAtSize(returnLine, returnFontSize) > mm(84)
  ) {
    returnFontSize -= 0.2;
  }
  page.drawText(returnLine, {
    x: leftX,
    y: returnY,
    size: returnFontSize,
    font: regularFont,
    color: textMuted,
  });
  page.drawLine({
    start: { x: leftX, y: returnY - 2.5 },
    end: { x: leftX + mm(85), y: returnY - 2.5 },
    thickness: 0.4,
    color: rgb(0.84, 0.86, 0.89),
  });

  const recipientLines = buildRecipientLines(letter);
  let recY = A4_HEIGHT_PT - mm(63.5);
  for (const line of recipientLines) {
    const wrappedRec = wrapTextLines(line, regularFont, 10, mm(84));
    for (const wRec of wrappedRec) {
      if (recY < A4_HEIGHT_PT - mm(88.5)) break;
      page.drawText(wRec, {
        x: leftX,
        y: recY,
        size: 10,
        font: regularFont,
        color: textDark,
      });
      recY -= 13.5;
    }
  }

  // Right Sender Info Block (DIN 5008 Form B: x=125mm, starts at 50mm from top)
  const rightX = mm(125);
  let infoY = A4_HEIGHT_PT - mm(50);
  const rightRows: Array<{ text: string; gapAfter: number }> = [
    { text: `${sender.owner} - ${sender.company}`, gapAfter: 17 },
    { text: sender.street, gapAfter: 12.5 },
    { text: sender.zipCity, gapAfter: 17 },
    { text: sender.phone, gapAfter: 12.5 },
    { text: sender.email, gapAfter: 12.5 },
    { text: sender.website, gapAfter: 18 },
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

  // Subject & Body (DIN 5008 Form B starts at ~104mm from top)
  const maxBodyWidth = mm(165);
  let cursorY = A4_HEIGHT_PT - mm(104);

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
        if (cursorY < mm(30)) break;
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

  // Clean 2-column business footer (without page counter)
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
              top: 2551, // 45mm DIN 5008-B address window start
              left: 1417, // 25mm DIN 5008-B
              right: 1134, // 20mm
              bottom: 1134, // 20mm
              header: 794, // 14mm logo start
              footer: 567,
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
                        spacing: { before: 520, after: 140 },
                        children: [
                          new TextRun({
                            text: `${sender.company} · ${sender.owner} · ${sender.street} · ${sender.zipCity}`,
                            size: 14,
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
