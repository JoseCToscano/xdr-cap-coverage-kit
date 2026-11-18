import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Fog } from "@/components/Fog";
import { Hud } from "@/components/Hud";
import { StatusProvider } from "@/components/StatusProvider";
import { REPO } from "@/lib/format";
import type { Status } from "@/lib/types";
import bundled from "@/public/status.json";
import "./globals.css";

const sans = localFont({ src: "./fonts/SpaceGrotesk-VariableFont_wght.ttf", variable: "--f-sans", weight: "300 700", display: "swap" });
const mono = localFont({ src: "./fonts/JetBrainsMono-VariableFont_wght.ttf", variable: "--f-mono", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "XDR/CAP Coverage Kit · Live differential checker", template: "%s · XDR/CAP Coverage Kit" },
  description: "Every Stellar mainnet ledger decoded by js-stellar-sdk, go-stellar-sdk and rs-stellar-xdr and compared value by value. Live status, findings, backfill results and union-arm coverage.",
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
};
export const viewport: Viewport = { themeColor: "#111214", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Fog />
        <a className="skip" href="#main">Skip to content</a>
        <StatusProvider initial={bundled as unknown as Status}>
          <Hud />
          <main id="main">{children}</main>
          <footer className="site-foot">
            <span>Read-only. Every number is read from the checker&apos;s state and findings files or from the reports in the repository.</span>
            <span><a href={REPO} target="_blank" rel="noopener noreferrer">Source on GitHub</a> · Apache-2.0</span>
          </footer>
        </StatusProvider>
      </body>
    </html>
  );
}
