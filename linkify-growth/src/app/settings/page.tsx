import { AppShell } from "@/components/AppShell";
import { SettingsView } from "@/components/SettingsView";
import { SignedOutView } from "@/components/SignedOutView";
import { loadWorkspaceSnapshot } from "@/lib/initial-state";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
      <SettingsView snapshot={snapshot} />
    </AppShell>
  );
}
