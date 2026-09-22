import globals from "globals";

// Unused bindings and definite mistakes. No formatting rules and no type-aware parser,
// so a tsconfig is not required.
const rules = {
  "no-cond-assign": "error",
  "no-constant-binary-expression": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-debugger": "error",
  "no-dupe-args": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty-pattern": "error",
  "no-ex-assign": "error",
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-global-assign": "error",
  "no-import-assign": "error",
  "no-invalid-regexp": "error",
  "no-loss-of-precision": "error",
  "no-obj-calls": "error",
  "no-redeclare": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-undef": "error",
  "no-unreachable": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-labels": "error",
  "no-unused-vars": ["error", {
    args: "none",
    caughtErrors: "none",
    varsIgnorePattern: "^_",
  }],
  "no-useless-catch": "error",
  "no-with": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "scripts/_tmp_*",
      "**/*mock*",
      "**/scratch-*",
    ],
  },
  {
    files: ["src/**/*.js", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, Alpine: "readonly" },
    },
    rules,
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.js", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, Alpine: "readonly" },
    },
    rules,
  },
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
