/**
 * Evidence kept beside a guide: for each claim, the verbatim quote that supports it
 * and the source it came from. scripts/verify-quotes.ts checks every quote against the
 * saved raw page text. A matching quote proves the words are on the page, not that the
 * claim reads them correctly.
 */
export type Evidence = { claimId: string; sourceId: string; quote: string };
