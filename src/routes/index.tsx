import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { evaluate, fpl, currency, PROGRAMS } from "@/lib/benefits";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Benefit Cliff — Social Welfare Eligibility Calculator" },
      {
        name: "description",
        content:
          "Estimate the maximum annual income your household can earn without losing SNAP, Medicaid, LIHEAP, or TANF benefits.",
      },
      { property: "og:title", content: "Benefit Cliff — Eligibility Calculator" },
      {
        property: "og:description",
        content:
          "See income thresholds for SNAP, Medicaid, LIHEAP, and TANF based on household size.",
      },
    ],
  }),
});

function Index() {
  const [size, setSize] = useState(3);
  const [income, setIncome] = useState(28000);

  const results = useMemo(() => evaluate(size, income), [size, income]);
  const baseFpl = useMemo(() => fpl(size), [size]);
  const sorted = [...results].sort((a, b) => a.limitAnnual - b.limitAnnual);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-display font-semibold">
              ₿
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Benefit Cliff
            </span>
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2024 Federal Guidelines
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-10">
        <p className="text-xs uppercase tracking-[0.22em] text-accent font-medium mb-5">
          Eligibility Estimator
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-semibold leading-[1.02] max-w-3xl">
          How much can your household earn before losing benefits?
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Enter your family size and annual income to estimate eligibility for{" "}
          SNAP, Medicaid, LIHEAP, and TANF — and see exactly where each
          benefit cliff begins.
        </p>
      </section>

      {/* Calculator */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          {/* Inputs */}
          <div className="bg-card border border-border rounded-2xl p-7 h-fit lg:sticky lg:top-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold mb-6">Your household</h2>

            <label className="block">
              <span className="text-sm font-medium">Family size</span>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setSize((s) => Math.max(1, s - 1))}
                  className="h-10 w-10 rounded-md border border-border hover:bg-secondary transition-colors text-lg"
                  aria-label="Decrease family size"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={size}
                  onChange={(e) =>
                    setSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  className="flex-1 h-10 text-center font-display text-xl rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={() => setSize((s) => Math.min(20, s + 1))}
                  className="h-10 w-10 rounded-md border border-border hover:bg-secondary transition-colors text-lg"
                  aria-label="Increase family size"
                >
                  +
                </button>
              </div>
            </label>

            <label className="block mt-7">
              <span className="text-sm font-medium">Annual household income</span>
              <div className="mt-3 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={income}
                  onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-11 pl-7 pr-3 rounded-md border border-border bg-background font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <input
                type="range"
                min={0}
                max={150000}
                step={500}
                value={income}
                onChange={(e) => setIncome(Number(e.target.value))}
                className="mt-3 w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>$0</span>
                <span>$150k</span>
              </div>
            </label>

            <div className="mt-7 pt-6 border-t border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">100% FPL ({size} ppl)</span>
                <span className="font-medium">{currency(baseFpl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your monthly income</span>
                <span className="font-medium">{currency(Math.round(income / 12))}</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            {sorted.map(({ program, limitAnnual, limitMonthly, eligible, headroom }) => (
              <article
                key={program.id}
                className={`rounded-2xl border p-6 md:p-7 transition-colors ${
                  eligible
                    ? "bg-card border-primary/30"
                    : "bg-card/60 border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-display text-2xl font-semibold">
                        {program.name}
                      </h3>
                      <span
                        className={`text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 rounded-full font-medium ${
                          eligible
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {eligible ? "Likely Eligible" : "Over Limit"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{program.fullName}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Max income ({program.fplPercent}% FPL)
                    </div>
                    <div className="font-display text-2xl font-semibold mt-0.5">
                      {currency(limitAnnual)}
                      <span className="text-sm text-muted-foreground font-sans font-normal">
                        {" "}/yr
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {currency(limitMonthly)}/mo
                    </div>
                  </div>
                </div>

                {/* Bar */}
                <div className="mt-5">
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        eligible ? "bg-primary" : "bg-accent"
                      }`}
                      style={{
                        width: `${Math.min(100, (income / limitAnnual) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-sm">
                    {eligible ? (
                      <span>
                        You can earn up to{" "}
                        <strong className="text-foreground">
                          {currency(headroom)}
                        </strong>{" "}
                        more per year before losing this benefit.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Income exceeds limit by{" "}
                        <strong className="text-foreground">
                          {currency(Math.abs(headroom))}
                        </strong>
                        /yr.
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                  {program.notes}
                </p>
              </article>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-12 max-w-3xl text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Important:</strong> This calculator
          provides estimates based on 2024 federal poverty guidelines for the 48
          contiguous states and D.C. Actual eligibility depends on your state,
          household composition, deductions, assets, and other factors. Alaska
          and Hawaii use different FPL values. Always verify with your state
          benefits office or{" "}
          <a
            href="https://www.benefits.gov"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-primary"
          >
            benefits.gov
          </a>
          .
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
          <span>Programs evaluated: {PROGRAMS.map((p) => p.name).join(" · ")}</span>
          <span className="ml-auto">Estimates only — not legal advice.</span>
        </div>
      </footer>
    </main>
  );
}
