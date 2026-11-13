import { Lock } from "lucide-react";
import { LinkifyLogo } from "./LinkifyLogo";

export function SignedOutView() {
  return (
    <main className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-[#E5E7EB] rounded-2xl p-8 space-y-5">
        <LinkifyLogo />
        <div className="flex items-start gap-3 pt-2">
          <div className="w-9 h-9 rounded-full bg-[#F0F3FF] text-[#0000F5] flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-[#1A1A2E]">
              Geschützter Linkify-Arbeitsbereich
            </h1>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              Diese Anwendung ist als privates Akquise- und Steuerungstool für
              Linkify geschützt. Bitte über die Cursor-Anmeldung öffnen, um
              Leads, Website-Audits und OpenRouter-Budgets zu verwalten.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
