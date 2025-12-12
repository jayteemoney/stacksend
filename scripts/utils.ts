/**
 * Utility functions for StackSend project
 */

/**
 * Format STX amount with proper decimals
 * @param amount Amount in micro-STX
 * @returns Formatted STX string
 */
export function formatSTX(amount: number): string {
  return (amount / 1_000_000).toFixed(6);
}

/**
 * Parse STX amount to micro-STX
 * @param stx Amount in STX
 * @returns Amount in micro-STX
 */
export function parseSTX(stx: number): number {
  return Math.floor(stx * 1_000_000);
}

/**
 * Calculate platform fee (0.5%)
 * @param amount Amount in micro-STX
 * @returns Fee amount in micro-STX
 */
export function calculatePlatformFee(amount: number): number {
  const FEE_BPS = 50; // 0.5% = 50 basis points
  const BASIS_POINTS = 10000;
  return Math.floor((amount * FEE_BPS) / BASIS_POINTS);
}

/**
 * Validate Stacks address format
 * @param address Stacks address to validate
 * @returns True if valid
 */
export function isValidStacksAddress(address: string): boolean {
  const mainnetPattern = /^SP[0-9A-Z]{38,41}$/;
  const testnetPattern = /^ST[0-9A-Z]{38,41}$/;
  return mainnetPattern.test(address) || testnetPattern.test(address);
}
