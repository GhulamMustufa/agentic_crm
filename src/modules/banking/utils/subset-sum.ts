import type { InvoiceEntity } from '../../invoices/domain/invoice.entity';

/**
 * Finds a subset of open invoices (between 2 and maxCombinationSize) whose
 * combined `amountDueCents` exactly equals `targetAmountCents`.
 *
 * Uses a branch-and-bound depth-first search sorted in descending order of invoice amount
 * to achieve optimal pruning and near-instant sub-millisecond execution.
 */
export function findInvoiceSubsetSum(
  invoices: InvoiceEntity[],
  targetAmountCents: bigint,
  maxCombinationSize = 5,
): InvoiceEntity[] | null {
  if (invoices.length < 2 || targetAmountCents <= 0n) {
    return null;
  }

  // Filter out any invoices with 0 or negative amount due, or invoices exceeding target
  const candidates = invoices
    .filter((inv) => inv.amountDueCents > 0n && inv.amountDueCents < targetAmountCents)
    .sort((a, b) =>
      b.amountDueCents > a.amountDueCents ? 1 : b.amountDueCents < a.amountDueCents ? -1 : 0,
    );

  if (candidates.length < 2) {
    return null;
  }

  const result: InvoiceEntity[] = [];

  function dfs(startIndex: number, currentSum: bigint, depth: number): boolean {
    if (currentSum === targetAmountCents && depth >= 2) {
      return true;
    }

    if (
      depth >= maxCombinationSize ||
      currentSum > targetAmountCents ||
      startIndex >= candidates.length
    ) {
      return false;
    }

    for (let i = startIndex; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!candidate) {
        continue;
      }

      if (currentSum + candidate.amountDueCents > targetAmountCents) {
        // Since candidates are sorted descending, continue to smaller items
        continue;
      }

      result.push(candidate);
      if (dfs(i + 1, currentSum + candidate.amountDueCents, depth + 1)) {
        return true;
      }
      result.pop();
    }

    return false;
  }

  const found = dfs(0, 0n, 0);
  return found ? result : null;
}
