import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, requireScopedIdentity } from "@/lib/auth";
import {
  buildBatchLetterPdfBuffer,
  buildLetterDocxBuffer,
  buildLettersZipBuffer,
  leadToLetterPayload,
  safeFileSlug,
  type LetterPayload,
} from "@/lib/letter-export";
import { buildFallbackOutreach } from "@/lib/prompts";
import { cleanStr, errorResponse, parseSafeJsonBody } from "@/lib/validation";
import {
  getBrandProfile,
  getLeadById,
  listAllOutreachForOwner,
  listLeads,
  listOutreachForLead,
  markLeadsPrinted,
} from "@/lib/workspace-data";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const leadId = (url.searchParams.get("leadId") ?? "").trim();
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase();

  if (!leadId) {
    return NextResponse.json(
      { error: "leadId fehlt." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const [brand, lead, outreach] = await Promise.all([
    getBrandProfile(auth.scopeKey),
    getLeadById(auth.scopeKey, leadId),
    listOutreachForLead(auth.scopeKey, leadId),
  ]);

  if (!lead) {
    return NextResponse.json(
      { error: "Lead nicht gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const briefDraft = outreach.find((o) => o.channel === "brief");
  const fallback = buildFallbackOutreach({ brand, lead, channel: "brief" });
  const payload = leadToLetterPayload(
    lead,
    briefDraft?.subject || fallback.subject,
    briefDraft?.body || fallback.body,
  );
  const slug = safeFileSlug(lead.company_name);

  if (format === "docx") {
    const docxBuffer = await buildLetterDocxBuffer(brand, payload);
    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        ...PRIVATE_JSON_HEADERS,
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${slug}_Brief.docx"`,
      },
    });
  }

  const pdfBytes = await buildBatchLetterPdfBuffer(brand, [payload]);
  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      ...PRIVATE_JSON_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}_Brief.pdf"`,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireScopedIdentity(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await parseSafeJsonBody(request, 32_768);
  } catch (err) {
    return errorResponse(err, 400);
  }

  const format = cleanStr(body.format, 30) || "batch_pdf";
  const rawIds = Array.isArray(body.leadIds)
    ? body.leadIds.map((v) => cleanStr(v, 80)).filter(Boolean).slice(0, 60)
    : [];

  if (rawIds.length === 0) {
    return NextResponse.json(
      { error: "Mindestens ein Lead muss ausgewählt sein." },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (format === "mark_printed") {
    const updatedCount = await markLeadsPrinted(
      auth.scopeKey,
      rawIds,
      body.markContacted !== false,
    );
    return NextResponse.json(
      { ok: true, updatedCount },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  const [brand, allLeads, allOutreach] = await Promise.all([
    getBrandProfile(auth.scopeKey),
    listLeads(auth.scopeKey),
    listAllOutreachForOwner(auth.scopeKey),
  ]);

  const leadMap = new Map(allLeads.map((l) => [l.id, l]));
  const briefByLead = new Map<string, { subject: string; body: string }>();
  for (const item of allOutreach) {
    if (item.channel === "brief" && !briefByLead.has(item.lead_id)) {
      briefByLead.set(item.lead_id, {
        subject: item.subject,
        body: item.body,
      });
    }
  }

  const letters: LetterPayload[] = [];
  for (const id of rawIds) {
    const lead = leadMap.get(id);
    if (!lead) continue;
    const draft = briefByLead.get(lead.id);
    const fallback = buildFallbackOutreach({ brand, lead, channel: "brief" });
    letters.push(
      leadToLetterPayload(
        lead,
        draft?.subject || fallback.subject,
        draft?.body || fallback.body,
      ),
    );
  }

  if (letters.length === 0) {
    return NextResponse.json(
      { error: "Keine passenden Briefe gefunden." },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  if (body.markPrinted) {
    await markLeadsPrinted(
      auth.scopeKey,
      letters.map((l) => l.leadId),
      body.markContacted !== false,
    );
  }

  if (format === "zip") {
    const zipBuf = await buildLettersZipBuffer(brand, letters);
    return new Response(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        ...PRIVATE_JSON_HEADERS,
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="Linkify_Briefe_Paket_${letters.length}.zip"`,
      },
    });
  }

  const batchPdf = await buildBatchLetterPdfBuffer(brand, letters);
  return new Response(Buffer.from(batchPdf), {
    status: 200,
    headers: {
      ...PRIVATE_JSON_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Linkify_Sammeldruck_${letters.length}_Briefe.pdf"`,
    },
  });
}
