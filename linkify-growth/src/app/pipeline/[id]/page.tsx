import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { LeadDetailView } from "@/components/LeadDetailView";
import { SignedOutView } from "@/components/SignedOutView";
import { getOptionalScopedIdentity } from "@/lib/auth";
import { loadWorkspaceSnapshot } from "@/lib/initial-state";
import { getLeadById, listOutreachForLead } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const snapshot = await loadWorkspaceSnapshot();
  if (!snapshot.authenticated) {
    return <SignedOutView />;
  }

  const { id } = await params;
  const reqHeaders = await headers();
  const auth = await getOptionalScopedIdentity(reqHeaders);

  const sampleOrDbLead =
    snapshot.leads.find((l) => l.id === id) ??
    (auth ? await getLeadById(auth.scopeKey, id) : null);

  const outreach =
    auth && sampleOrDbLead
      ? await listOutreachForLead(auth.scopeKey, sampleOrDbLead.id)
      : [];

  return (
    <AppShell
      viewer={snapshot.viewer}
      openRouterConnected={snapshot.openRouterConnected}
      brand={snapshot.brand}
      usageSummary={snapshot.usageSummary}
    >
      {sampleOrDbLead ? (
        <LeadDetailView
          initialLead={sampleOrDbLead}
          initialOutreach={outreach}
          brand={snapshot.brand}
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-8 space-y-3">
          <h1 className="text-[20px] font-semibold text-[#1A1A2E]">
            Lead nicht gefunden
          </h1>
          <p className="text-[14px] text-[#6B7280]">
            Dieser Datensatz existiert nicht oder gehört zu einem anderen Konto.
          </p>
          <Link
            href="/pipeline"
            className="inline-block text-[14px] font-medium text-[#0000F5] hover:underline"
          >
            Zurück zur Lead-Pipeline
          </Link>
        </div>
      )}
    </AppShell>
  );
}
