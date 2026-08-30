export const GMAIL_RECIPIENT_LIMIT = 500;
export const MAX_BCC_RECIPIENTS = GMAIL_RECIPIENT_LIMIT - 1;
export const DEFAULT_BATCH_SIZE = 300;
export const MIN_STANDALONE_REMAINDER = 100;

export function planBatchSizes(
  totalRecipients: number,
  targetSize = DEFAULT_BATCH_SIZE,
  minimumStandalone = MIN_STANDALONE_REMAINDER,
): number[] {
  if (!Number.isInteger(totalRecipients) || totalRecipients < 1) {
    throw new Error('Recipient count must be a positive integer.');
  }
  if (!Number.isInteger(targetSize) || targetSize < 1 || targetSize > MAX_BCC_RECIPIENTS) {
    throw new Error(`Batch size must be between 1 and ${MAX_BCC_RECIPIENTS}.`);
  }
  if (!Number.isInteger(minimumStandalone) || minimumStandalone < 1) {
    throw new Error('Minimum standalone remainder must be positive.');
  }

  const fullBatchCount = Math.floor(totalRecipients / targetSize);
  const remainder = totalRecipients % targetSize;
  if (fullBatchCount === 0) return [remainder];

  const sizes = Array.from({ length: fullBatchCount }, () => targetSize);
  if (remainder === 0) return sizes;
  const canMerge = remainder < minimumStandalone && targetSize + remainder <= MAX_BCC_RECIPIENTS;
  if (canMerge) sizes[sizes.length - 1] += remainder;
  else sizes.push(remainder);
  return sizes;
}
