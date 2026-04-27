// 2024 HHS Federal Poverty Guidelines (48 contiguous states + DC), annual
// Source: https://aspe.hhs.gov/poverty-guidelines
const FPL_BASE_2024 = 15060; // 1-person household
const FPL_INCREMENT_2024 = 5380; // each additional person

export function fpl(householdSize: number): number {
  const size = Math.max(1, Math.floor(householdSize));
  return FPL_BASE_2024 + (size - 1) * FPL_INCREMENT_2024;
}

export type Program = {
  id: string;
  name: string;
  fullName: string;
  /** Income limit as a percentage of FPL */
  fplPercent: number;
  description: string;
  notes: string;
};

export const PROGRAMS: Program[] = [
  {
    id: "snap",
    name: "SNAP",
    fullName: "Supplemental Nutrition Assistance Program",
    fplPercent: 130,
    description: "Monthly benefits to help purchase food.",
    notes:
      "Federal gross income limit is 130% of FPL. Households with elderly or disabled members may qualify under different rules.",
  },
  {
    id: "medicaid",
    name: "Medicaid",
    fullName: "Medicaid (ACA Expansion, Adults)",
    fplPercent: 138,
    description: "Free or low-cost health coverage.",
    notes:
      "138% of FPL applies to adults in expansion states. Children, pregnant individuals, and CHIP often have higher thresholds.",
  },
  {
    id: "liheap",
    name: "LIHEAP",
    fullName: "Low Income Home Energy Assistance Program",
    fplPercent: 150,
    description: "Help with heating, cooling, and energy bills.",
    notes:
      "Federal cap is 150% of FPL (or 60% of state median income, whichever is greater). State limits vary.",
  },
  {
    id: "tanf",
    name: "TANF",
    fullName: "Temporary Assistance for Needy Families",
    fplPercent: 50,
    description: "Cash assistance for families with children.",
    notes:
      "TANF income limits vary dramatically by state — often well below 100% of FPL. ~50% of FPL is used here as a conservative federal benchmark.",
  },
];

export type EligibilityResult = {
  program: Program;
  limitAnnual: number;
  limitMonthly: number;
  eligible: boolean;
  headroom: number; // limit - income (negative = over)
};

export function evaluate(
  householdSize: number,
  annualIncome: number,
): EligibilityResult[] {
  const baseFpl = fpl(householdSize);
  return PROGRAMS.map((program) => {
    const limitAnnual = Math.round((baseFpl * program.fplPercent) / 100);
    return {
      program,
      limitAnnual,
      limitMonthly: Math.round(limitAnnual / 12),
      eligible: annualIncome <= limitAnnual,
      headroom: limitAnnual - annualIncome,
    };
  });
}

export const currency = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
