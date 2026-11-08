// Run from the repository root with `npm run lint`. Plugins resolve from tools/lint/node_modules,
// where typescript-eslint gets TypeScript 6 (it does not support the app's TypeScript 7 yet).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: "." } } },
  {
    // The app sets state in effects only to read browser-only values after mount (saved preferences,
    // window.location, the clock, crypto.randomUUID submission keys, reduced-motion) or to reset a form
    // after a save. Doing that during render would make server and browser output differ, so this is
    // a warning to review case by case, not an error. Reviewed 2026-11-08: all 27 uses follow this.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "supabase/**", "tools/**", "node_modules/**"]),
]);
