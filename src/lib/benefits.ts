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
//   Adults 19–64:           ≤ 138% FPL
//   Children (Healthy Start/CHIP): ≤ 211% FPL
//   Pregnant individuals:   ≤ 200% FPL
// We report the most generous category that applies to the household.
// -----------------------------------------------------------------------------
export type MedicaidDetail = {
  category: "Adults" | "Children/Pregnant";
  fplPercent: number;
  limitAnnual: number;
  eligible: boolean;
};

export function evaluateMedicaid(i: Inputs): MedicaidDetail {
  const useChildTier = i.hasChildOrPregnant;
  const pct = useChildTier ? 211 : 138;
  const limitAnnual = Math.round((fpl(i.householdSize) * pct) / 100);
  return {
    category: useChildTier ? "Children/Pregnant" : "Adults",
    fplPercent: pct,
    limitAnnual,
    eligible: i.annualIncome <= limitAnnual,
  };
}

// -----------------------------------------------------------------------------
// Ohio HEAP (LIHEAP) — Ohio Development Services Agency uses 175% FPL.
// -----------------------------------------------------------------------------
export type HeapDetail = {
  fplPercent: 175;
  limitAnnual: number;
  eligible: boolean;
};

export function evaluateHeap(i: Inputs): HeapDetail {
  const limitAnnual = Math.round(fpl(i.householdSize) * 1.75);
  return { fplPercent: 175, limitAnnual, eligible: i.annualIncome <= limitAnnual };
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
  id: "snap" | "medicaid" | "heap" | "owf";
  name: string;
  fullName: string;
  eligible: boolean;
  /** Maximum annual gross income at which household still qualifies */
  maxAnnualIncome: number;
  /** Plain-language headline for the result card */
  headline: string;
  notes: string[];
};

export function evaluateAll(i: Inputs): ProgramSummary[] {
  const snap = evaluateSnap(i);
  const medicaid = evaluateMedicaid(i);
  const heap = evaluateHeap(i);
  const owf = evaluateOwf(i);

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
      id: "medicaid",
      name: "Medicaid",
      fullName: `Ohio Medicaid — ${medicaid.category} tier`,
      eligible: medicaid.eligible,
      maxAnnualIncome: medicaid.limitAnnual,
      headline: medicaid.eligible
        ? `Qualifies under ${medicaid.category} (${medicaid.fplPercent}% FPL)`
        : `Income exceeds ${medicaid.fplPercent}% FPL threshold`,
      notes: [
        `Ohio expanded Medicaid: adults 19–64 qualify up to 138% FPL.`,
        `Children & pregnant individuals qualify up to 211% / 200% FPL respectively.`,
        `MAGI-based — no asset test for these categories.`,
        `Aged, Blind, or Disabled (ABD) Medicaid uses different rules and an asset limit ($2,000 individual). Not modeled here.`,
      ],
    },
    {
      id: "heap",
      name: "HEAP",
      fullName: "Ohio Home Energy Assistance Program (LIHEAP)",
      eligible: heap.eligible,
      maxAnnualIncome: heap.limitAnnual,
      headline: heap.eligible
        ? `Within Ohio's 175% FPL limit`
        : `Income exceeds 175% FPL`,
      notes: [
        `Ohio HEAP threshold is 175% FPL (more generous than the federal 150% floor).`,
        `Same threshold applies to the Winter Crisis Program (Nov–Mar) and Summer Crisis Program (Jul–Sep).`,
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
