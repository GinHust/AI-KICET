import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { panels, renderPanel } from "@/lib/dashboard-data";
import type { PanelKey } from "@kicetic/shared/contracts";

const panelKeys: PanelKey[] = ["overview", "research", "bo", "surrogate", "physical-ai", "x-ai"];

export function generateStaticParams() {
  return panelKeys.map((panel) => ({ panel }));
}

export default async function DashboardPanelPage({
  params,
  searchParams
}: {
  params: Promise<{ panel: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { panel } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!panelKeys.includes(panel as PanelKey)) {
    notFound();
  }

  const activePanel = panel as PanelKey;
  const current = panels.find((item) => item.key === activePanel);
  const view = typeof resolvedSearchParams?.view === "string" ? resolvedSearchParams.view : undefined;

  return (
    <AppShell
      activePanel={activePanel}
      panels={panels}
      title={current?.label ?? "KICETIC Dashboard"}
      subtitle={current?.summary ?? "KICETIC panel workspace"}
    >
      {renderPanel(activePanel, view)}
    </AppShell>
  );
}
