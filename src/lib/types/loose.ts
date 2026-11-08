/**
 * Rows read from Supabase without generated database types. This is the one place the app allows
 * `any`; replacing it with types from `supabase gen types` is a tracked follow-up.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;
export type LooseRow = Record<string, Loose>;
