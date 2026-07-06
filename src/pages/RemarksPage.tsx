import React, { useState, useRef, useEffect, forwardRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { groupNameToId } from "../config/menu";

const AccordionItem = forwardRef<
  HTMLDivElement,
  {
    title: string;
    children: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
  }
>(function AccordionItem({ title, children, isOpen, onToggle }, ref) {
  return (
    <div
      ref={ref}
      className="border border-slate-200 rounded-lg overflow-hidden scroll-mt-24"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-left font-medium text-slate-800 bg-white hover:bg-slate-50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
        {title}
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-white border-t border-slate-200 text-sm text-slate-700 prose prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
          {children}
        </div>
      )}
    </div>
  );
});

const CONTENT_STRATEGY_ROWS = [
  { category: "Educational Guides", allocation: "35%", goal: "Long-term SEO / Evergreen" },
  { category: "Technical/Foundational Analysis", allocation: "15%", goal: "Retention / Trust" },
  { category: "Market News & Insights", allocation: "35%", goal: "Topical Authority" },
  { category: "Trading Psychology & Risk", allocation: "15%", goal: "E-E-A-T / Compliance" },
  { category: "Platform & Product News", allocation: "0%", goal: "Conversions" },
];

export default function RemarksPage() {
  const { groupName } = useAuth();
  const canSeeCapitalStrategy = groupNameToId(groupName) === "capital";
  const [openAccordion, setOpenAccordion] = useState<number | null>(null);
  const accordionRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    if (openAccordion !== null && accordionRefs.current[openAccordion]) {
      accordionRefs.current[openAccordion]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [openAccordion]);

  if (!canSeeCapitalStrategy) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <>
      <section className="p-6 mb-3">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Content strategy - Capital.com
        </h2>
        <p className="text-sm text-slate-500 mb-4">Content mix for editorial planning.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm text-left border-collapse bg-white">
            <thead>
              <tr
                className="text-white"
                style={{ background: "linear-gradient(90deg, #ff7900, #ffd000)" }}
              >
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Allocation</th>
                <th className="px-4 py-3 font-medium">Goal</th>
              </tr>
            </thead>
            <tbody>
              {CONTENT_STRATEGY_ROWS.map((row, i) => (
                <tr key={i} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-4 py-3 text-slate-800 font-semibold">{row.category}</td>
                  <td className="px-4 py-3 text-slate-700">{row.allocation}</td>
                  <td className="px-4 py-3 text-slate-700">{row.goal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Remarks
        </h2>
        <div className="space-y-1">
          <AccordionItem
            ref={(el) => { accordionRefs.current[0] = el; }}
            title="Writing style guidelines"
            isOpen={openAccordion === 0}
            onToggle={() => setOpenAccordion(openAccordion === 0 ? null : 0)}
          >
            <ol className="list-decimal list-inside space-y-2 pl-1">
              <li>Remove subjective or astrology‑style framing.</li>
              <li>Reframe content to imply actionable &apos;what to do&apos; guidance (non‑advisory, educational tone).</li>
              <li>Maintain a strictly analysis‑led, neutral tone throughout.</li>
              <li>Exclude any form of investment recommendations, position sizing, or timing.</li>
              <li>Add citations for all key numbers and claims.</li>
              <li>Use only reliable, verifiable sources for data points.</li>
              <li>Insert citations as hyperlinks directly within the article text.</li>
            </ol>
          </AccordionItem>
          <AccordionItem
            ref={(el) => { accordionRefs.current[1] = el; }}
            title="The E-E-A-T Implementation Framework"
            isOpen={openAccordion === 1}
            onToggle={() => setOpenAccordion(openAccordion === 1 ? null : 1)}
          >
            <div className="space-y-4">
              <p>
                <strong>Experience (The &quot;I&apos;ve Been There&quot; Factor):</strong> Move beyond theory. Don&apos;t just define a &quot;Stop Loss&quot;; describe a specific scenario where a trailing stop saved a trade during high NFP volatility. Use first-person language and real platform screenshots to prove you have hands-on experience with the tools you are discussing.
              </p>
              <p>
                <strong>Expertise (The &quot;I Know My Stuff&quot; Factor):</strong> Ensure every piece of content is attributed to a qualified professional. Use formal author bylines that highlight financial certifications (e.g., CMT, CFA) or years of institutional trading. This signals to Google that the information is technically accurate and sophisticated.
              </p>
              <p>
                <strong>Authoritativeness (The &quot;Others Trust Me&quot; Factor):</strong> Build a reputation as a &quot;go-to&quot; source. Cite official data from central banks (Fed, ECB) or major exchanges (CME, NYSE). When other reputable financial news sites link back to your analysis as a reference, your domain&apos;s authority rises in the eyes of search algorithms.
              </p>
              <p>
                <strong>Trustworthiness (The &quot;Safety First&quot; Factor):</strong> This is your most critical pillar. Maintain extreme transparency by placing mandatory risk warnings prominently, providing clear &quot;About Us&quot; and &quot;Contact&quot; pages, and keeping your content updated. In the Forex world, showing that you are a regulated, honest entity is the ultimate way to win both Google&apos;s rankings and a trader&apos;s deposit.
              </p>
            </div>
          </AccordionItem>
          <AccordionItem
            ref={(el) => { accordionRefs.current[2] = el; }}
            title="SCB Content Compliance Framework"
            isOpen={openAccordion === 2}
            onToggle={() => setOpenAccordion(openAccordion === 2 ? null : 2)}
          >
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-slate-800 mt-2 mb-1">1. Leverage &amp; Product Transparency (The &quot;Accuracy&quot; Pillar)</h4>
                <p className="mb-2">The SCB is very specific about leverage limits. In 2026, retail traders are generally capped at 200:1 for major FX pairs.</p>
                <p><strong>Instruction:</strong> Never use &quot;unlimited leverage&quot; or &quot;500:1&quot; in your headlines if targeting retail traders.</p>
                <p><strong>Content Action:</strong> Create a dedicated &quot;Trading Conditions&quot; page. Use a table to clearly list SCB-mandated leverage for each asset class (e.g., 200:1 for FX, 20:1 for Stocks/Crypto).</p>
                <p><strong>SEO Benefit:</strong> Tables with specific numbers are often pulled into Google&apos;s &quot;Featured Snippets.&quot;</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mt-2 mb-1">2. Negative Balance Protection &amp; Margin Rules</h4>
                <p className="mb-2">SCB rules require brokers to provide Negative Balance Protection and a 50% Margin Close-out rule for retail clients.</p>
                <p><strong>Instruction:</strong> Frame these not just as &quot;rules,&quot; but as &quot;Investor Protection Features.&quot;</p>
                <p><strong>Content Action:</strong> Write a guide titled &quot;How SCB Regulations Protect Your Capital.&quot; Explain how the 50% stop-out prevents traders from losing more than their initial deposit.</p>
                <p><strong>SEO Benefit:</strong> This builds Trustworthiness (the &apos;T&apos; in E-E-A-T) by showing you prioritize client safety over broker profit.</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mt-2 mb-1">3. Professional vs. Retail Categorization</h4>
                <p className="mb-2">The SCB allows for higher leverage (up to 1000:1) only for Professional Clients who meet specific criteria (e.g., $500k net worth or relevant experience).</p>
                <p><strong>Instruction:</strong> Avoid &quot;blanket&quot; marketing of high leverage. Always qualify it.</p>
                <p><strong>Content Action:</strong> Create a &quot;Professional Trader Account&quot; landing page. Clearly outline the SCB requirements to qualify (the &quot;quantitative and qualitative tests&quot;).</p>
                <p><strong>SEO Benefit:</strong> Targets high-net-worth &quot;whales&quot; using specific long-tail keywords like &quot;SCB professional trader requirements.&quot;</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mt-2 mb-1">4. Binary Options &amp; Prohibited Products</h4>
                <p className="mb-2">The SCB has banned the sale of Binary Options to retail investors.</p>
                <p><strong>Instruction:</strong> Ensure your content library is audited to remove any legacy mentions of binary options or high-risk &quot;all-or-nothing&quot; bets.</p>
                <p><strong>Content Action:</strong> Replace high-risk product content with &quot;Risk Management Education,&quot; focusing on Stop-Losses and Take-Profits.</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 mt-2 mb-1">5. Mandatory Disclosures (The &quot;Must-Haves&quot;)</h4>
                <p className="mb-2">Every piece of content—whether a 200-word market update or a 2,000-word guide—must be &quot;fair, clear, and not misleading.&quot;</p>
                <p><strong>Instruction:</strong> Standardize your footer.</p>
                <p><strong>Content Action:</strong> Ensure every page includes:</p>
                <p className="pl-4 mt-1 italic">&quot;Company Name is regulated by the Securities Commission of The Bahamas (License No. SIA-FXXX). CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage.&quot;</p>
                <p><strong>SEO Benefit:</strong> Consistent, accurate regulatory footers help Google&apos;s bots verify your entity as a legitimate, regulated business.</p>
              </div>
            </div>
          </AccordionItem>
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        <Link to="/" className="text-primary hover:underline">Back to Dashboard</Link>
      </p>
    </>
  );
}
