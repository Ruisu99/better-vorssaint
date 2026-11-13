"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  Mail,
  Radar,
  SlidersHorizontal,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { BrandProfile, ViewerInfo } from "@/lib/types";
import { LinkifyLogo } from "./LinkifyLogo";

interface AppShellProps {
  viewer: ViewerInfo | null;
  openRouterConnected: boolean;
  brand: BrandProfile;
  usageSummary: {
    monthCalls: number;
    monthCostUsd: number;
    todayCalls: number;
    todayCostUsd: number;
    monthTokens: number;
  };
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Cockpit", icon: LayoutDashboard },
  { href: "/radar", label: "Kunden-Radar", icon: Radar },
  { href: "/pipeline", label: "Lead-Pipeline", icon: Users },
  { href: "/outreach", label: "Akquise & Antworten", icon: Mail },
  { href: "/content", label: "Content-Studio", icon: FileText },
  { href: "/settings", label: "KI & Kosten", icon: SlidersHorizontal },
];

export function AppShell({
  viewer,
  openRouterConnected,
  brand,
  usageSummary,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const monthEur = usageSummary.monthCostUsd * brand.budget_config.eurPerUsdRate;
  const budgetEur = brand.budget_config.monthlyBudgetEur;
  const budgetPct =
    budgetEur > 0 ? Math.min(Math.round((monthEur / budgetEur) * 100), 100) : 100;

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-[#1A1A2E] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-[#E5E7EB] px-5 py-6 justify-between">
        <div className="space-y-8">
          <Link href="/" className="block focus:outline-none">
            <LinkifyLogo />
          </Link>

          <nav className="space-y-1.5" aria-label="Hauptnavigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                    active
                      ? "bg-[#F0F3FF] text-[#0000F5]"
                      : "text-[#6B7280] hover:text-[#1A1A2E] hover:bg-[#F8F9FC]"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Budget & AI Guardrail Widget */}
        <div className="space-y-3 pt-6 border-t border-[#E5E7EB]">
          <Link
            href="/settings"
            className="block rounded-xl border border-[#E5E7EB] bg-[#F8F9FC] p-3.5 hover:border-[#0000F5]/40 transition-colors"
          >
            <div className="flex items-center justify-between text-[12px] font-medium">
              <span className="text-[#1A1A2E]">OpenRouter KI</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                  openRouterConnected
                    ? "bg-[#F0F3FF] text-[#0000F5]"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {openRouterConnected ? "Verbunden" : "Vorschau-Modus"}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between text-[12px]">
              <span className="text-[#6B7280]">Monatsbudget</span>
              <span className="font-semibold text-[#1A1A2E]">
                {monthEur.toFixed(2)} € / {budgetEur.toFixed(0)} €
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPct >= 90 ? "bg-amber-600" : "bg-[#0000F5]"
                }`}
                style={{ width: `${budgetEur > 0 ? budgetPct : 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>
                Heute: {usageSummary.todayCalls} / {brand.budget_config.dailyMaxCalls} Calls
              </span>
              {brand.openrouter_config.privacyMode && (
                <span className="inline-flex items-center gap-1 text-[#1A1A2E]">
                  <ShieldCheck className="w-3 h-3 text-[#0000F5]" />
                  Privacy
                </span>
              )}
            </div>
          </Link>

          {viewer && (
            <div className="px-1 text-[12px] text-[#6B7280] flex items-center justify-between">
              <span className="truncate">{viewer.name}</span>
              {viewer.simulated && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                  Lokal simuliert
                </span>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Topbar */}
      <header className="no-print lg:hidden bg-white border-b border-[#E5E7EB] px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3">
          <Link href="/">
            <LinkifyLogo />
          </Link>
          <div className="flex items-center gap-2 text-[12px]">
            <span
              className={`px-2.5 py-1 rounded-full font-medium ${
                openRouterConnected
                  ? "bg-[#F0F3FF] text-[#0000F5]"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {monthEur.toFixed(2)} € / {budgetEur.toFixed(0)} €
            </span>
          </div>
        </div>
        <nav
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Mobile Navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#0000F5] text-white"
                    : "bg-[#F8F9FC] text-[#6B7280]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
