import { AppShell } from "@/components/AppShell";
import { PipelineView } from "@/components/PipelineView";
import { SignedOutView } from "@/components/SignedOutView";
import { loadWorkspaceSnapshot } from "@/lib/initial-state";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const snapshot = await loadWorkspaceSnapshot();
  if (!snapshot.authenticated) {
    return <SignedOutView />;
  }

  return (
    <AppShell
      viewer={snapshot.viewer}
      openRouterConnected={snapshot.openRouterConnected}
      brand={snapshot.brand}
      usageSummary={snapshot.usageSummary}
    >
      <PipelineView snapshot={snapshot} />
    </AppShell>
  );
}
