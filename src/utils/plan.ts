import { PlanTier } from '../context/AuthContext';

// Single source of truth for plan tier ordering.
const planRank: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2, elite: 3 };

/** True if `userPlan` meets or exceeds `requiredPlan`. Missing plan = treated as free. */
export function hasPlanAccess(userPlan: PlanTier | undefined | null, requiredPlan: PlanTier): boolean {
  return planRank[userPlan ?? 'free'] >= planRank[requiredPlan];
}

/**
 * True only when the plan is KNOWN and below the requirement. Use this to skip
 * a doomed plan-gated request without hiding the feature from a user whose plan
 * hasn't loaded yet (undefined → false → the call still fires, preserving prior
 * behavior). Never skip on an unknown plan.
 */
export function planKnownBelow(userPlan: PlanTier | undefined | null, requiredPlan: PlanTier): boolean {
  return userPlan != null && !hasPlanAccess(userPlan, requiredPlan);
}
