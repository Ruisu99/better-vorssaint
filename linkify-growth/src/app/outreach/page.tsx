import { AppShell } from "@/components/AppShell";
import { OutreachView } from "@/components/OutreachView";
import { SignedOutView } from "@/components/SignedOutView";
import { loadWorkspaceSnapshot } from "@/lib/initial-state";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
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
      <OutreachView snapshot={snapshot} />
    </AppShell>
  );
}
