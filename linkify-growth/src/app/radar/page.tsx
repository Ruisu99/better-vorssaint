import { AppShell } from "@/components/AppShell";
import { RadarView } from "@/components/RadarView";
import { SignedOutView } from "@/components/SignedOutView";
import { loadWorkspaceSnapshot } from "@/lib/initial-state";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
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
      <RadarView snapshot={snapshot} />
    </AppShell>
  );
}
