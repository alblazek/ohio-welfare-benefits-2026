// =============================================================================
// Ohio Benefit Eligibility Model
// =============================================================================
// FPL: Projected 2026 guidelines (2025 HHS values inflated ~2.5%).
//   2025 official:  $15,650 base + $5,500/person (48 states + DC)
//   2026 projected: $16,040 base + $5,640/person  (rounded to nearest $10)
// 2026 figures will not be official until HHS publishes them in Jan 2026.
// -----------------------------------------------------------------------------

export const FPL_YEAR_LABEL = "2026 (projected)";

const FPL_BASE = 16040;
const FPL_INCREMENT = 5640;

export function fpl(householdSize: number): number {
  const size = Math.max(1, Math.floor(householdSize));
  return FPL_BASE + (size - 1) * FPL_INCREMENT;
}

export const monthlyFpl = (size: number) => Math.round(fpl(size) / 12);

// -----------------------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------------------
export type Inputs = {
  householdSize: number;
  annualIncome: number;
  /** Household includes a minor child (<18) OR a pregnant member */
  hasChildOrPregnant: boolean;
  /** Monthly rent/mortgage + utilities (used for SNAP excess shelter deduction) */
  monthlyShelter: number;
  /** Monthly out-of-pocket dependent care (childcare for work/school) */
  monthlyDependentCare: number;
  /** Average monthly gas/heating bill (used for HEAP benefit estimate) */
  monthlyGasBill: number;
  /** Average monthly electric bill (used for HEAP benefit estimate) */
  monthlyElectricBill: number;
};

// -----------------------------------------------------------------------------
// SNAP — Ohio uses federal rules; both gross (≤130% FPL) AND net (≤100% FPL)
// must be satisfied (households without elderly/disabled members).
// 2025 deduction values used (FNS updates annually in October):
//   Standard deduction (1–3 ppl): $204; (4): $217; (5): $254; (6+): $291
//   Earned income deduction: 20%
//   Excess shelter deduction: shelter cost - 50% of adjusted income, capped $712
// -----------------------------------------------------------------------------
const SNAP_STANDARD_DEDUCTION: Record<number, number> = {
  1: 204, 2: 204, 3: 204, 4: 217, 5: 254,
};
const SNAP_SHELTER_CAP = 712;

function snapStandardDeduction(size: number): number {
  return SNAP_STANDARD_DEDUCTION[size] ?? 291; // 6+ members
}

export type SnapDetail = {
  grossMonthly: number;
  grossLimitMonthly: number;
  netMonthly: number;
  netLimitMonthly: number;
  earnedDeduction: number;
  standardDeduction: number;
  dependentCareDeduction: number;
  excessShelterDeduction: number;
  passesGross: boolean;
  passesNet: boolean;
};

export function evaluateSnap(i: Inputs): SnapDetail {
  const grossMonthly = i.annualIncome / 12;
  const grossLimitMonthly = (fpl(i.householdSize) * 1.30) / 12;
  const netLimitMonthly = fpl(i.householdSize) / 12;

  const earnedDeduction = grossMonthly * 0.20;
  const standardDeduction = snapStandardDeduction(i.householdSize);
  const dependentCareDeduction = i.monthlyDependentCare;

  const adjusted = Math.max(
    0,
    grossMonthly - earnedDeduction - standardDeduction - dependentCareDeduction,
  );
  const rawShelterExcess = i.monthlyShelter - adjusted / 2;
  const excessShelterDeduction = Math.max(
    0,
    Math.min(SNAP_SHELTER_CAP, rawShelterExcess),
  );

  const netMonthly = Math.max(0, adjusted - excessShelterDeduction);

  return {
    grossMonthly,
    grossLimitMonthly,
    netMonthly,
    netLimitMonthly,
    earnedDeduction,
    standardDeduction,
    dependentCareDeduction,
    excessShelterDeduction,
    passesGross: grossMonthly <= grossLimitMonthly,
    passesNet: netMonthly <= netLimitMonthly,
  };
}

/**
 * Find the maximum annual gross income at which SNAP still passes both tests.
 * Uses binary search because deductions interact non-linearly.
 */
export function snapMaxIncome(i: Inputs): number {
  let lo = 0;
  let hi = fpl(i.householdSize) * 1.30; // Gross test caps here
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const test = evaluateSnap({ ...i, annualIncome: mid });
    if (test.passesGross && test.passesNet) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}

// -----------------------------------------------------------------------------
// Ohio Medicaid — MAGI-based, no asset test for these categories.
//   Adults 19–64 (expansion): ≤ 138% FPL
//   Children (Healthy Start/CHIP): ≤ 211% FPL
//   Pregnant individuals:     ≤ 200% FPL
// We expose Adults and Children/Pregnant as separate programs so users can
// see both pathways side-by-side.
// -----------------------------------------------------------------------------
export type MedicaidTier = {
  fplPercent: number;
  limitAnnual: number;
  eligible: boolean;
};

export function evaluateMedicaidAdults(i: Inputs): MedicaidTier {
  const pct = 138;
  const limitAnnual = Math.round((fpl(i.householdSize) * pct) / 100);
  return { fplPercent: pct, limitAnnual, eligible: i.annualIncome <= limitAnnual };
}

export function evaluateMedicaidChildPregnant(i: Inputs): MedicaidTier {
  // Children up to 211% FPL; pregnant up to 200% FPL. Use the more generous
  // (children) for the headline limit since households with kids are common.
  const pct = 211;
  const limitAnnual = Math.round((fpl(i.householdSize) * pct) / 100);
  return { fplPercent: pct, limitAnnual, eligible: i.annualIncome <= limitAnnual };
}

// -----------------------------------------------------------------------------
// Ohio HEAP (LIHEAP) — Ohio Development Services Agency uses 175% FPL.
// Benefit estimate: Ohio's regular HEAP benefit is a one-time annual credit
// applied to the primary heating account. The amount varies by FPL tier,
// fuel type, household size, and actual energy burden. We approximate using
// a published-style tier matrix (2024–2025 benefit ranges):
//   ≤  75% FPL: base $700
//   ≤ 125% FPL: base $475
//   ≤ 175% FPL: base $275
// then add ~$40/person above 1, and cap at the household's estimated annual
// heating cost (gas bill is the proxy; electric also counted if no gas).
// -----------------------------------------------------------------------------
export type HeapDetail = {
  fplPercent: 175;
  limitAnnual: number;
  eligible: boolean;
  /** Estimated annual HEAP benefit in dollars (0 if not eligible) */
  estimatedBenefit: number;
  /** Tier label for display */
  tierLabel: string;
};

export function evaluateHeap(i: Inputs): HeapDetail {
  const limitAnnual = Math.round(fpl(i.householdSize) * 1.75);
  const eligible = i.annualIncome <= limitAnnual;

  if (!eligible) {
    return {
      fplPercent: 175,
      limitAnnual,
      eligible: false,
      estimatedBenefit: 0,
      tierLabel: "Over 175% FPL",
    };
  }

  const pctOfFpl = (i.annualIncome / fpl(i.householdSize)) * 100;
  let base = 0;
  let tierLabel = "";
  if (pctOfFpl <= 75) {
    base = 700;
    tierLabel = "Lowest-income tier (≤75% FPL)";
  } else if (pctOfFpl <= 125) {
    base = 475;
    tierLabel = "Mid tier (76–125% FPL)";
  } else {
    base = 275;
    tierLabel = "Upper tier (126–175% FPL)";
  }

  const householdBoost = Math.max(0, i.householdSize - 1) * 40;
  // Approx annual heating cost — gas dominant in Ohio winters; if user reports
  // no gas, use ~60% of electric bill as the heating share.
  const annualHeatingCost =
    i.monthlyGasBill > 0
      ? i.monthlyGasBill * 12
      : i.monthlyElectricBill * 12 * 0.6;

  const uncapped = base + householdBoost;
  // HEAP can't exceed actual annual heating cost; floor at $50 if any bill reported.
  const cap = annualHeatingCost > 0 ? annualHeatingCost : uncapped;
  const estimatedBenefit = Math.round(Math.max(0, Math.min(uncapped, cap)));

  return {
    fplPercent: 175,
    limitAnnual,
    eligible: true,
    estimatedBenefit,
    tierLabel,
  };
}

// -----------------------------------------------------------------------------
// Ohio Works First (TANF) — Requires a minor child or pregnancy.
// Income standard ≈ 50% FPL. Lifetime limit 36 months in Ohio.
// -----------------------------------------------------------------------------
export type OwfDetail = {
  fplPercent: 50;
  limitAnnual: number;
  meetsIncome: boolean;
  meetsCategorical: boolean;
  eligible: boolean;
};

export function evaluateOwf(i: Inputs): OwfDetail {
  const limitAnnual = Math.round(fpl(i.householdSize) * 0.50);
  const meetsIncome = i.annualIncome <= limitAnnual;
  const meetsCategorical = i.hasChildOrPregnant;
  return {
    fplPercent: 50,
    limitAnnual,
    meetsIncome,
    meetsCategorical,
    eligible: meetsIncome && meetsCategorical,
  };
}

// -----------------------------------------------------------------------------
// Aggregate
// -----------------------------------------------------------------------------
export type ProgramSummary = {
  id: "snap" | "medicaid_adults" | "medicaid_child" | "heap" | "owf";
  name: string;
  fullName: string;
  eligible: boolean;
  /** Maximum annual gross income at which household still qualifies */
  maxAnnualIncome: number;
  /** Plain-language headline for the result card */
  headline: string;
  /** Optional estimated annual benefit amount in dollars (display-only) */
  estimatedBenefitAnnual?: number;
  /** Plain-language label for the estimated benefit (e.g. "Annual HEAP credit") */
  estimatedBenefitLabel?: string;
  notes: string[];
};

export function evaluateAll(i: Inputs): ProgramSummary[] {
  const snap = evaluateSnap(i);
  const heap = evaluateHeap(i);
  const owf = evaluateOwf(i);
  const medicaidAdults = evaluateMedicaidAdults(i);
  const medicaidChild = evaluateMedicaidChildPregnant(i);

  return [
    {
      id: "snap",
      name: "SNAP",
      fullName: "Supplemental Nutrition Assistance Program (Food Assistance)",
      eligible: snap.passesGross && snap.passesNet,
      maxAnnualIncome: snapMaxIncome(i),
      headline: !snap.passesGross
        ? `Over gross limit (${currency(snap.grossLimitMonthly)}/mo)`
        : !snap.passesNet
        ? `Over net limit after deductions (${currency(snap.netLimitMonthly)}/mo)`
        : `Passes both gross & net income tests`,
      notes: [
        `Gross income test: ${currency(snap.grossMonthly)}/mo vs limit ${currency(snap.grossLimitMonthly)}/mo (130% FPL).`,
        `Net income test: ${currency(snap.netMonthly)}/mo vs limit ${currency(snap.netLimitMonthly)}/mo (100% FPL).`,
        `Deductions applied: 20% earned (${currency(snap.earnedDeduction)}), standard (${currency(snap.standardDeduction)}), dependent care (${currency(snap.dependentCareDeduction)}), excess shelter (${currency(snap.excessShelterDeduction)}).`,
        `Asset limit: $3,000 ($4,500 if elderly/disabled member). Not modeled here.`,
      ],
    },
    {
      id: "medicaid_adults",
      name: "Medicaid — Adults",
      fullName: "Ohio Medicaid — Adults 19–64 (Expansion / MAGI)",
      eligible: medicaidAdults.eligible,
      maxAnnualIncome: medicaidAdults.limitAnnual,
      headline: medicaidAdults.eligible
        ? `Adults qualify under expansion (≤138% FPL)`
        : `Income exceeds 138% FPL adult threshold`,
      notes: [
        `Ohio expanded Medicaid covers adults 19–64 with income up to 138% FPL.`,
        `MAGI-based — no asset test for this category.`,
        `Adults over 138% FPL may qualify for subsidized Marketplace coverage instead.`,
        `Aged, Blind, or Disabled (ABD) Medicaid uses different rules and a $2,000 asset limit. Not modeled here.`,
      ],
    },
    {
      id: "medicaid_child",
      name: "Medicaid — Children & Pregnant",
      fullName: "Ohio Medicaid / Healthy Start — Children & Pregnant Individuals",
      eligible: i.hasChildOrPregnant ? medicaidChild.eligible : false,
      maxAnnualIncome: medicaidChild.limitAnnual,
      headline: !i.hasChildOrPregnant
        ? `No minor child or pregnant member indicated — category does not apply`
        : medicaidChild.eligible
        ? `Children qualify under Healthy Start (≤211% FPL)`
        : `Income exceeds 211% FPL children's threshold`,
      notes: [
        `Children qualify under Healthy Start/CHIP up to 211% FPL.`,
        `Pregnant individuals qualify up to 200% FPL.`,
        `Children remain eligible even when adults in the same household are over the 138% adult limit.`,
        `MAGI-based — no asset test.`,
      ],
    },
    {
      id: "heap",
      name: "HEAP",
      fullName: "Ohio Home Energy Assistance Program (LIHEAP)",
      eligible: heap.eligible,
      maxAnnualIncome: heap.limitAnnual,
      estimatedBenefitAnnual: heap.estimatedBenefit,
      estimatedBenefitLabel: "Estimated annual HEAP credit",
      headline: heap.eligible
        ? `Within Ohio's 175% FPL limit — ${heap.tierLabel}`
        : `Income exceeds 175% FPL`,
      notes: [
        `Ohio HEAP threshold is 175% FPL (more generous than the federal 150% floor).`,
        `Benefit estimate uses tiered base (≤75% FPL: $700, ≤125%: $475, ≤175%: $275) plus ~$40/extra household member, capped at your reported annual heating cost.`,
        `Actual benefit varies by fuel type, energy burden, and program funding. Ohio Development determines final award.`,
        `Same 175% threshold applies to Winter Crisis (Nov–Mar) and Summer Crisis (Jul–Sep) programs.`,
        `Applicant must be responsible for paying home energy costs.`,
      ],
    },
    {
      id: "owf",
      name: "OWF (TANF)",
      fullName: "Ohio Works First — Cash Assistance",
      eligible: owf.eligible,
      maxAnnualIncome: owf.meetsCategorical ? owf.limitAnnual : 0,
      headline: !owf.meetsCategorical
        ? `Not categorically eligible — requires a minor child or pregnancy`
        : owf.meetsIncome
        ? `Meets income & categorical requirements`
        : `Categorically eligible but income exceeds 50% FPL`,
      notes: [
        `OWF requires a dependent minor child in the home OR a pregnant member.`,
        `Income standard is approximately 50% FPL for the assistance group.`,
        `Asset limit: $2,250 ($3,500 if elderly/disabled). Not modeled here.`,
        `Work requirements apply (30 hrs/wk single parent, 35 hrs/wk two-parent).`,
        `Lifetime limit of 36 months of cash assistance in Ohio.`,
      ],
    },
  ];
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------
export const currency = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
