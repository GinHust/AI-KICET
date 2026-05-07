import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "KICETIC",
  description: "AI-native research acceleration platform — closed-loop autonomous experimentation, physics-informed BO, and explainable AI for domain-specific R&D"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(74,104,179,0.14),transparent_64%)]" />
          <div className="absolute inset-x-0 top-24 h-40 bg-[linear-gradient(180deg,rgba(44,10,50,0.5),transparent)]" />
          <div className="relative">{children}</div>
        </div>
      </body>
    </html>
  );
}
