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
  /** Estimated monthly SNAP allotment in dollars (0 if not eligible) */
  estimatedMonthlyBenefit: number;
  /** Maximum monthly SNAP allotment for this household size */
  maxMonthlyBenefit: number;
};

// USDA SNAP maximum monthly allotments — FY2025 (48 states + DC).
// Updated each Oct 1; FY2026 values not yet published.
const SNAP_MAX_ALLOTMENT: Record<number, number> = {
  1: 292, 2: 536, 3: 768, 4: 975, 5: 1158, 6: 1390, 7: 1536, 8: 1756,
};
const SNAP_MAX_ADDITIONAL = 220; // per person beyond 8
// Minimum benefit for 1–2 person eligible households (FY2025)
const SNAP_MIN_BENEFIT = 23;

function snapMaxAllotment(size: number): number {
  if (size <= 8) return SNAP_MAX_ALLOTMENT[size];
  return SNAP_MAX_ALLOTMENT[8] + (size - 8) * SNAP_MAX_ADDITIONAL;
}

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

  const passesGross = grossMonthly <= grossLimitMonthly;
  const passesNet = netMonthly <= netLimitMonthly;
  const maxMonthlyBenefit = snapMaxAllotment(i.householdSize);

  // Benefit formula: max allotment - 30% of net income, rounded down.
  // Min benefit ($23) applies to eligible 1–2 person households.
  let estimatedMonthlyBenefit = 0;
  if (passesGross && passesNet) {
    const raw = Math.floor(maxMonthlyBenefit - 0.3 * netMonthly);
    if (raw <= 0) {
      estimatedMonthlyBenefit = i.householdSize <= 2 ? SNAP_MIN_BENEFIT : 0;
    } else {
      estimatedMonthlyBenefit = raw;
    }
  }

  return {
    grossMonthly,
    grossLimitMonthly,
    netMonthly,
    netLimitMonthly,
    earnedDeduction,
    standardDeduction,
    dependentCareDeduction,
    excessShelterDeduction,
    passesGross,
    passesNet,
    estimatedMonthlyBenefit,
    maxMonthlyBenefit,
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
// Ohio PIPP Plus — Percentage of Income Payment Plan Plus
// Caps the household's regulated utility payment at a percentage of monthly
// gross income, with arrears credits for on-time payment.
// Eligibility: ≤ 150% FPL (Ohio PUCO rule, more restrictive than HEAP).
// Payment formula:
//   - Electric-heat household: 10% of monthly gross income to electric
//   - Gas-heat household: 5% to gas + 5% to electric (10% total)
//   Minimum payment $10 per utility per month.
// Estimated benefit = (current bill exposure) − (PIPP capped payment),
//   floored at 0, summed across utilities, annualized.
// -----------------------------------------------------------------------------
export type PippDetail = {
  fplPercent: 150;
  limitAnnual: number;
  eligible: boolean;
  /** Monthly PIPP-capped payment for gas (0 if all-electric heat or ineligible) */
  monthlyGasPayment: number;
  /** Monthly PIPP-capped payment for electric */
  monthlyElectricPayment: number;
  /** Estimated annual credit vs. typical Ohio utility cost (or user bill, whichever is higher) */
  estimatedAnnualSavings: number;
  /** Baseline monthly bills used in the credit estimate (after applying typical-cost floor) */
  baselineMonthlyGas: number;
  baselineMonthlyElectric: number;
  heatType: "gas" | "electric" | "unknown";
};

const PIPP_MIN_PAYMENT = 10;
// Ohio typical residential utility costs (EIA 2023 averages, rough):
//   Natural gas heat: ~$95/mo (annualized — winter peaks much higher)
//   Electric (non-heat): ~$135/mo
//   All-electric heat: ~$200/mo
const PIPP_TYPICAL_GAS = 95;
const PIPP_TYPICAL_ELEC_NONHEAT = 135;
const PIPP_TYPICAL_ELEC_HEAT = 200;

export function evaluatePipp(i: Inputs): PippDetail {
  const limitAnnual = Math.round(fpl(i.householdSize) * 1.50);
  const eligible = i.annualIncome <= limitAnnual;
  const monthlyIncome = i.annualIncome / 12;

  // Infer heat type from reported bills: gas reported → gas heat; otherwise electric.
  // (Default to gas — the most common Ohio heat source — when no bills entered.)
  const heatType: PippDetail["heatType"] =
    i.monthlyGasBill > 0 ? "gas" : i.monthlyElectricBill > 0 ? "electric" : "gas";

  // Baseline = max(user-reported bill, Ohio typical) so credit estimate stays
  // stable and meaningful even when the user hasn't entered detailed bills.
  const baselineMonthlyGas =
    heatType === "gas" ? Math.max(i.monthlyGasBill, PIPP_TYPICAL_GAS) : 0;
  const baselineMonthlyElectric =
    heatType === "electric"
      ? Math.max(i.monthlyElectricBill, PIPP_TYPICAL_ELEC_HEAT)
      : Math.max(i.monthlyElectricBill, PIPP_TYPICAL_ELEC_NONHEAT);

  if (!eligible) {
    return {
      fplPercent: 150,
      limitAnnual,
      eligible: false,
      monthlyGasPayment: 0,
      monthlyElectricPayment: 0,
      estimatedAnnualSavings: 0,
      baselineMonthlyGas,
      baselineMonthlyElectric,
      heatType,
    };
  }

  let monthlyGasPayment = 0;
  let monthlyElectricPayment = 0;

  if (heatType === "gas") {
    monthlyGasPayment = Math.max(PIPP_MIN_PAYMENT, Math.round(monthlyIncome * 0.05));
    monthlyElectricPayment = Math.max(PIPP_MIN_PAYMENT, Math.round(monthlyIncome * 0.05));
  } else {
    monthlyElectricPayment = Math.max(PIPP_MIN_PAYMENT, Math.round(monthlyIncome * 0.10));
  }

  // Credit = baseline bill - capped payment, never negative.
  const gasSavings = Math.max(0, baselineMonthlyGas - monthlyGasPayment);
  const electricSavings = Math.max(0, baselineMonthlyElectric - monthlyElectricPayment);
  const estimatedAnnualSavings = Math.round((gasSavings + electricSavings) * 12);

  return {
    fplPercent: 150,
    limitAnnual,
    eligible: true,
    monthlyGasPayment,
    monthlyElectricPayment,
    estimatedAnnualSavings,
    baselineMonthlyGas,
    baselineMonthlyElectric,
    heatType,
  };
}

// -----------------------------------------------------------------------------
// ACA Marketplace Premium Tax Credit (PTC) — healthcare.gov
// Eligibility: household income generally 100%–400% FPL. Under the IRA
// (extended through plan year 2025; assumed continued for 2026 modeling),
// the 400% FPL cliff is removed and the applicable percentage caps are:
//   ≤150% FPL: 0% of income
//   150–200%:  0–2%
//   200–250%:  2–4%
//   250–300%:  4–6%
//   300–400%:  6–8.5%
//   ≥400%:     8.5%
// In Ohio, adults <138% FPL are routed to expansion Medicaid (no PTC).
// Subsidy = max(0, benchmark Silver premium − expected contribution).
// Benchmark (second-lowest-cost Silver) varies by county/age/family. We use
// rough Ohio family averages: $700/mo single adult, scaled by household size.
// -----------------------------------------------------------------------------
export type AcaDetail = {
  fplPercentLower: 100;
  fplPercentUpper: 400;
  /** Income floor (typically 138% FPL in Ohio because of Medicaid expansion) */
  lowerLimitAnnual: number;
  /** Soft upper limit (400% FPL) — above this still eligible under IRA but at 8.5% cap */
  upperLimitAnnual: number;
  eligible: boolean;
  /** Reason ineligible, if applicable */
  reason: string;
  /** Applicable percentage of income expected to be contributed to premium */
  applicablePercent: number;
  /** Expected annual household contribution toward Silver benchmark */
  expectedAnnualContribution: number;
  /** Estimated benchmark Silver plan annual premium for this household */
  benchmarkAnnualPremium: number;
  /** Estimated annual Premium Tax Credit (subsidy) */
  estimatedAnnualSubsidy: number;
};

// Rough monthly benchmark Silver premium in Ohio (second-lowest-cost Silver,
// average non-tobacco adult ~age 40). Family pricing approximated by adding
// ~$500/mo for a second adult and ~$350/mo per child, capped at 3 children.
const ACA_BENCHMARK_ADULT_MONTHLY = 500;
const ACA_BENCHMARK_SECOND_ADULT_MONTHLY = 500;
const ACA_BENCHMARK_CHILD_MONTHLY = 350;
const ACA_MAX_BILLED_CHILDREN = 3;

function acaApplicablePercent(pctOfFpl: number): number {
  if (pctOfFpl <= 150) return 0;
  if (pctOfFpl <= 200) return 0 + ((pctOfFpl - 150) / 50) * (2 - 0);
  if (pctOfFpl <= 250) return 2 + ((pctOfFpl - 200) / 50) * (4 - 2);
  if (pctOfFpl <= 300) return 4 + ((pctOfFpl - 250) / 50) * (6 - 4);
  if (pctOfFpl <= 400) return 6 + ((pctOfFpl - 300) / 100) * (8.5 - 6);
  return 8.5;
}

function acaBenchmarkMonthly(householdSize: number): number {
  // Heuristic: assume 2 adults if household ≥2, remainder are children up to cap.
  const adults = householdSize >= 2 ? 2 : 1;
  const children = Math.min(ACA_MAX_BILLED_CHILDREN, Math.max(0, householdSize - adults));
  return (
    ACA_BENCHMARK_ADULT_MONTHLY +
    (adults === 2 ? ACA_BENCHMARK_SECOND_ADULT_MONTHLY : 0) +
    children * ACA_BENCHMARK_CHILD_MONTHLY
  );
}

export function evaluateAca(i: Inputs): AcaDetail {
  const baseFpl = fpl(i.householdSize);
  const lowerLimitAnnual = Math.round(baseFpl * 1.38); // Ohio Medicaid cutoff
  const upperLimitAnnual = Math.round(baseFpl * 4.00);
  const pctOfFpl = (i.annualIncome / baseFpl) * 100;
  const benchmarkAnnualPremium = Math.round(acaBenchmarkMonthly(i.householdSize) * 12);

  // Ineligibility paths
  if (i.annualIncome < Math.round(baseFpl * 1.0)) {
    return {
      fplPercentLower: 100, fplPercentUpper: 400,
      lowerLimitAnnual, upperLimitAnnual,
      eligible: false,
      reason: "Income below 100% FPL — likely Medicaid-eligible instead.",
      applicablePercent: 0,
      expectedAnnualContribution: 0,
      benchmarkAnnualPremium,
      estimatedAnnualSubsidy: 0,
    };
  }
  if (i.annualIncome <= lowerLimitAnnual) {
    return {
      fplPercentLower: 100, fplPercentUpper: 400,
      lowerLimitAnnual, upperLimitAnnual,
      eligible: false,
      reason: "Eligible for Ohio Medicaid expansion (≤138% FPL) — Marketplace subsidies not available.",
      applicablePercent: 0,
      expectedAnnualContribution: 0,
      benchmarkAnnualPremium,
      estimatedAnnualSubsidy: 0,
    };
  }

  const applicablePercent = acaApplicablePercent(pctOfFpl);
  const expectedAnnualContribution = Math.round(i.annualIncome * (applicablePercent / 100));
  const estimatedAnnualSubsidy = Math.max(0, benchmarkAnnualPremium - expectedAnnualContribution);

  return {
    fplPercentLower: 100, fplPercentUpper: 400,
    lowerLimitAnnual, upperLimitAnnual,
    eligible: estimatedAnnualSubsidy > 0,
    reason: estimatedAnnualSubsidy > 0
      ? "Qualifies for Premium Tax Credit"
      : "Income too high — expected contribution exceeds benchmark Silver premium.",
    applicablePercent,
    expectedAnnualContribution,
    benchmarkAnnualPremium,
    estimatedAnnualSubsidy,
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
  id: "snap" | "medicaid_adults" | "medicaid_child" | "aca" | "heap" | "pipp" | "owf";
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
  const pipp = evaluatePipp(i);
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
      estimatedBenefitAnnual: snap.estimatedMonthlyBenefit * 12,
      estimatedBenefitLabel: `Estimated SNAP allotment (${currency(snap.estimatedMonthlyBenefit)}/mo)`,
      notes: [
        `Gross income test: ${currency(snap.grossMonthly)}/mo vs limit ${currency(snap.grossLimitMonthly)}/mo (130% FPL).`,
        `Net income test: ${currency(snap.netMonthly)}/mo vs limit ${currency(snap.netLimitMonthly)}/mo (100% FPL).`,
        `Deductions applied: 20% earned (${currency(snap.earnedDeduction)}), standard (${currency(snap.standardDeduction)}), dependent care (${currency(snap.dependentCareDeduction)}), excess shelter (${currency(snap.excessShelterDeduction)}).`,
        `Benefit formula: max allotment for ${i.householdSize} (${currency(snap.maxMonthlyBenefit)}/mo) minus 30% of net income, rounded down. Min $23 for 1–2 person households.`,
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
      id: "pipp",
      name: "PIPP Plus",
      fullName: "Ohio Percentage of Income Payment Plan Plus",
      eligible: pipp.eligible,
      maxAnnualIncome: pipp.limitAnnual,
      estimatedBenefitAnnual: pipp.estimatedAnnualSavings,
      estimatedBenefitLabel: "Estimated annual PIPP credit",
      headline: !pipp.eligible
        ? `Income exceeds 150% FPL PIPP threshold`
        : `Eligible — payment capped at ${pipp.heatType === "electric" ? "10%" : "5%+5%"} of monthly income`,
      notes: [
        pipp.eligible && pipp.heatType === "electric"
          ? `PIPP capped payment: ${currency(pipp.monthlyElectricPayment)}/mo electric (vs. baseline ${currency(pipp.baselineMonthlyElectric)}/mo for an all-electric Ohio home).`
          : pipp.eligible
          ? `PIPP capped payment: ${currency(pipp.monthlyGasPayment)}/mo gas + ${currency(pipp.monthlyElectricPayment)}/mo electric (vs. baseline ${currency(pipp.baselineMonthlyGas + pipp.baselineMonthlyElectric)}/mo for a gas-heated Ohio home).`
          : `PIPP would cap gas at 5% and electric at 5% of monthly income (or 10% to electric only if all-electric heat).`,
        `Credit estimate = (baseline monthly utility cost − PIPP capped payment) × 12. Baseline is the higher of your reported bills or Ohio typical residential cost (gas ~$95, electric ~$135, all-electric heat ~$200).`,
        `Heat type is inferred from your bills — gas bill present = gas heat; otherwise all-electric. Defaults to gas if no bills entered (most common in Ohio).`,
        `Gas-heated homes pay 5% of income to gas + 5% to electric (10% total).`,
        `All-electric heated homes pay 10% of income to electric only.`,
        `Minimum payment is $10 per utility per month, even at very low income.`,
        `Eligibility threshold is 150% FPL — stricter than HEAP's 175% FPL.`,
        `On-time, in-full payments earn arrears credits that reduce past-due balances.`,
        `Must be a customer of a regulated electric/gas utility (Duke, AEP, Columbia Gas, etc.).`,
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
