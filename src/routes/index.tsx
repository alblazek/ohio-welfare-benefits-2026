import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { evaluateAll, fpl, currency, FPL_YEAR_LABEL, type Inputs } from "@/lib/benefits";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Ohio Benefit Cliff — SNAP, Medicaid, HEAP & OWF Calculator" },
      {
        name: "description",
        content:
          "Estimate Ohio eligibility for SNAP, Medicaid, HEAP, and Ohio Works First (TANF). Uses projected 2026 FPL and Ohio-specific rules including SNAP net-income deductions.",
      },
      { property: "og:title", content: "Ohio Benefit Cliff Calculator" },
      {
        property: "og:description",
        content:
          "Ohio-specific eligibility for SNAP, Medicaid, HEAP, and OWF — modeled with deductions, child/pregnancy requirements, and shelter costs.",
      },
    ],
  }),
});

function Index() {
  const [inputs, setInputs] = useState<Inputs>({
    householdSize: 3,
    annualIncome: 28000,
    hasChildOrPregnant: true,
    monthlyShelter: 1200,
    monthlyDependentCare: 0,
    monthlyGasBill: 90,
    monthlyElectricBill: 130,
  });

  const update = <K extends keyof Inputs>(k: K, v: Inputs[K]) =>
    setInputs((s) => ({ ...s, [k]: v }));

  const results = useMemo(() => evaluateAll(inputs), [inputs]);
  const baseFpl = useMemo(() => fpl(inputs.householdSize), [inputs.householdSize]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-display font-semibold">
              OH
            </div>
            <div>
              <div className="font-display text-lg font-semibold tracking-tight leading-none">
                Ohio Benefit Cliff
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                SNAP · Medicaid · HEAP · OWF
              </div>
            </div>
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            FPL: {FPL_YEAR_LABEL}
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-accent font-medium mb-5">
          Ohio Eligibility Estimator
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold leading-[1.05] max-w-3xl">
          How much can your Ohio household earn before losing benefits?
        </h1>
        <p className="mt-5 text-base text-muted-foreground max-w-2xl leading-relaxed">
          Models Ohio-specific rules: SNAP gross & net income tests with
          deductions, Ohio Works First's minor-child requirement, HEAP's 175%
          FPL threshold, and Medicaid's MAGI tiers.
        </p>
      </section>

      {/* Calculator */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
          {/* Inputs */}
          <div className="bg-card border border-border rounded-2xl p-6 h-fit lg:sticky lg:top-6 shadow-sm space-y-6">
            <h2 className="font-display text-xl font-semibold">Your household</h2>

            {/* Family size */}
            <label className="block">
              <span className="text-sm font-medium">Household size</span>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => update("householdSize", Math.max(1, inputs.householdSize - 1))}
                  className="h-10 w-10 rounded-md border border-border hover:bg-secondary transition-colors text-lg"
                  aria-label="Decrease size"
                >−</button>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={inputs.householdSize}
                  onChange={(e) =>
                    update("householdSize", Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  className="flex-1 h-10 text-center font-display text-xl rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={() => update("householdSize", Math.min(20, inputs.householdSize + 1))}
                  className="h-10 w-10 rounded-md border border-border hover:bg-secondary transition-colors text-lg"
                  aria-label="Increase size"
                >+</button>
              </div>
            </label>

            {/* Income */}
            <label className="block">
              <span className="text-sm font-medium">Annual gross income</span>
              <div className="mt-2 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={inputs.annualIncome}
                  onChange={(e) => update("annualIncome", Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-11 pl-7 pr-3 rounded-md border border-border bg-background font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </label>

            {/* Categorical */}
            <label className="flex items-start gap-3 cursor-pointer p-3 -m-3 rounded-md hover:bg-secondary/50 transition-colors">
              <input
                type="checkbox"
                checked={inputs.hasChildOrPregnant}
                onChange={(e) => update("hasChildOrPregnant", e.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-sm font-medium">Minor child or pregnancy in household</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Required for OWF; unlocks higher Medicaid tier (211% FPL).
                </div>
              </div>
            </label>

            {/* Shelter */}
            <label className="block">
              <span className="text-sm font-medium">Monthly shelter cost</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Rent/mortgage + utilities. Affects SNAP net-income deduction.
              </span>
              <div className="mt-2 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={inputs.monthlyShelter}
                  onChange={(e) => update("monthlyShelter", Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-10 pl-7 pr-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </label>

            {/* Dependent care */}
            <label className="block">
              <span className="text-sm font-medium">Monthly dependent care</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Childcare paid for work or school. SNAP deduction.
              </span>
              <div className="mt-2 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={25}
                  value={inputs.monthlyDependentCare}
                  onChange={(e) => update("monthlyDependentCare", Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-10 pl-7 pr-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </label>

            {/* Energy bills */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Monthly gas bill</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  For HEAP estimate.
                </span>
                <div className="mt-2 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={inputs.monthlyGasBill}
                    onChange={(e) => update("monthlyGasBill", Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-10 pl-7 pr-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Monthly electric</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Used if no gas heating.
                </span>
                <div className="mt-2 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={inputs.monthlyElectricBill}
                    onChange={(e) => update("monthlyElectricBill", Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-10 pl-7 pr-3 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </label>
            </div>

            <div className="pt-5 border-t border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">100% FPL ({inputs.householdSize} ppl)</span>
                <span className="font-medium">{currency(baseFpl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly income</span>
                <span className="font-medium">{currency(Math.round(inputs.annualIncome / 12))}</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            {results.map((r) => {
              const ratio = r.maxAnnualIncome > 0
                ? Math.min(100, (inputs.annualIncome / r.maxAnnualIncome) * 100)
                : 100;
              const headroom = r.maxAnnualIncome - inputs.annualIncome;

              return (
                <article
                  key={r.id}
                  className={`rounded-2xl border p-6 md:p-7 transition-colors ${
                    r.eligible ? "bg-card border-primary/40" : "bg-card/60 border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-display text-2xl font-semibold">{r.name}</h3>
                        <span
                          className={`text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 rounded-full font-medium ${
                            r.eligible
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {r.eligible ? "Likely Eligible" : "Not Eligible"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{r.fullName}</p>
                      <p className="text-sm mt-2">{r.headline}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Max income to qualify
                      </div>
                      <div className="font-display text-2xl font-semibold mt-0.5">
                        {r.maxAnnualIncome > 0 ? currency(r.maxAnnualIncome) : "—"}
                        {r.maxAnnualIncome > 0 && (
                          <span className="text-sm text-muted-foreground font-sans font-normal"> /yr</span>
                        )}
                      </div>
                      {r.maxAnnualIncome > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {currency(Math.round(r.maxAnnualIncome / 12))}/mo
                        </div>
                      )}
                    </div>
                  </div>

                  {r.maxAnnualIncome > 0 && (
                    <div className="mt-5">
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            r.eligible ? "bg-primary" : "bg-accent"
                          }`}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                      <div className="mt-2 text-sm">
                        {r.eligible ? (
                          <span>
                            You can earn up to{" "}
                            <strong className="text-foreground">{currency(headroom)}</strong>{" "}
                            more per year before losing this benefit.
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Income exceeds limit by{" "}
                            <strong className="text-foreground">{currency(Math.abs(headroom))}</strong>/yr.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {r.eligible && r.estimatedBenefitAnnual !== undefined && r.estimatedBenefitAnnual > 0 && (
                    <div className="mt-5 rounded-xl bg-primary/10 border border-primary/30 px-4 py-3 flex items-baseline justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {r.estimatedBenefitLabel ?? "Estimated benefit"}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Approximate — final amount set by program administrator.
                        </div>
                      </div>
                      <div className="font-display text-2xl font-semibold text-primary whitespace-nowrap">
                        {currency(r.estimatedBenefitAnnual)}
                        <span className="text-sm text-muted-foreground font-sans font-normal"> /yr</span>
                      </div>
                    </div>
                  )}

                  <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground leading-relaxed list-disc pl-5">
                    {r.notes.map((n, idx) => (
                      <li key={idx}>{n}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-12 max-w-3xl text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <strong className="text-foreground">About the 2026 figures:</strong>{" "}
            HHS publishes official Federal Poverty Guidelines each January. The
            2026 numbers used here are projected by inflating the 2025 official
            values (~2.5%). Once HHS publishes 2026 guidelines, swap them in.
          </p>
          <p>
            <strong className="text-foreground">Limitations:</strong> This tool
            does not model asset/resource limits (SNAP $3,000 / OWF $2,250),
            elderly or disabled household rules, ABD Medicaid, work
            requirements, or Ohio's 36-month OWF lifetime limit. Estimates only —
            not legal advice. Verify with{" "}
            <a
              href="https://benefits.ohio.gov"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-primary"
            >
              benefits.ohio.gov
            </a>{" "}
            or your county Job & Family Services office.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
          <span>State: Ohio · Programs: SNAP · Medicaid · HEAP · OWF</span>
          <span className="ml-auto">Estimates only — not legal advice.</span>
        </div>
      </footer>
    </main>
  );
}
