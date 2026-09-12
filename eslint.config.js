// ESLint (added 2026-09-12 by the forensic audit -- the project had a type
// checker and a test suite but no linter at all). Flat config, deliberately
// small: the TypeScript "recommended" rules plus the two React hooks rules.
// Anything stricter belongs in a separate decision, not here.
//
//   pnpm lint
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "client/public/vendor/**", ".playwright-mcp/**", "scratchpad/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    // The plugin's newer "recommended" set also ships the React Compiler
    // rules (set-state-in-effect, refs, purity, immutability). Those flag 39
    // places in this codebase that work and are tested; adopting them is a
    // refactor to plan, not a lint setting. The two rules that catch real
    // bugs stay on.
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.ts", "shared/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // `_prefixed` is this codebase's convention for a deliberately unused
      // destructured field (e.g. stripping passwordHash off a user row).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrors: "none" }],
      // Empty catch blocks are used deliberately (JSON.parse / localStorage
      // guards) and each carries a comment; the rule would only add noise.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
