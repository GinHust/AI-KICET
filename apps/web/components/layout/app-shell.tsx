"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { NavPanel, PanelKey } from "@kicetic/shared/contracts";
import { SurfaceCard } from "@/components/ui/surface-card";

type AppShellProps = {
  activePanel: PanelKey;
  panels: NavPanel[];
  title: string;
  subtitle: string;
  children: ReactNode;
};

const ADVANCED_CONTROLS_STORAGE_KEY = "kicetic-advanced-controls";
const ADVANCED_CONTROLS_EVENT_NAME = "kicetic-advanced-controls-changed";
const ADVANCED_CLICK_THRESHOLD = 10;
const ADVANCED_CLICK_WINDOW_MS = 3000;

export function AppShell({ activePanel, panels, title, subtitle, children }: AppShellProps) {
  const homePanel = panels.find((panel) => panel.key === "overview");
  const workflowPanels = panels.filter((panel) => panel.key !== "overview");
  const researchClickTimestampsRef = useRef<number[]>([]);

  function handlePanelClick(panelKey: PanelKey) {
    if (panelKey !== "research" || typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const nextTimestamps = [...researchClickTimestampsRef.current.filter((timestamp) => now - timestamp <= ADVANCED_CLICK_WINDOW_MS), now];

    if (nextTimestamps.length < ADVANCED_CLICK_THRESHOLD) {
      researchClickTimestampsRef.current = nextTimestamps;
      return;
    }

    researchClickTimestampsRef.current = [];
    const nextEnabled = window.localStorage.getItem(ADVANCED_CONTROLS_STORAGE_KEY) !== "true";
    window.localStorage.setItem(ADVANCED_CONTROLS_STORAGE_KEY, nextEnabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent(ADVANCED_CONTROLS_EVENT_NAME, { detail: { enabled: nextEnabled } }));
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1580px] items-center gap-4 px-4 py-3 lg:px-6">
          <span className="shrink-0 text-2xl font-black tracking-tight">
            <span style={{ color: "#1A4FA0" }}>KI</span><span style={{ color: "#F26522" }}>CET</span><span style={{ color: "#1A4FA0" }}>IC</span>
          </span>
          <span className="h-5 w-px shrink-0 bg-line" />
          <div className="flex items-center gap-2 overflow-x-auto">
            {homePanel ? (
              <Link
                href={homePanel.href as Route}
                onClick={() => handlePanelClick(homePanel.key)}
                className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  activePanel === homePanel.key
                    ? "border-line-strong bg-white text-ink shadow-card"
                    : "border-line bg-surface-muted text-soft hover:bg-white"
                }`}
              >
                {homePanel.label}
              </Link>
            ) : null}
            {workflowPanels.map((panel) => {
              const isActive = panel.key === activePanel;
              return (
                <Link
                  key={panel.key}
                  href={panel.href as Route}
                  onClick={() => handlePanelClick(panel.key)}
                  className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    isActive ? "border-line-strong bg-white text-ink shadow-card" : "border-line bg-surface-muted text-soft hover:bg-white"
                  }`}
                >
                  {panel.label}
                  <span className="ml-1.5 text-faint">· {panel.summary}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1580px] px-4 py-5 lg:px-6 lg:py-6">
        <SurfaceCard className="rounded-panel p-4 md:p-6">
          {children}
        </SurfaceCard>
      </div>
    </div>
  );
}
