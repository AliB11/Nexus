/**
 * ESLint flat config.
 *
 * NEXUS ships unbundled ES modules straight to the browser, so the two things
 * that matter most here are: (1) browser globals for src/, node globals for
 * scripts/ and tests/, and (2) rules that catch real defects — undefined
 * variables, unused imports, accidental globals — rather than style, which
 * Prettier owns.
 *
 * The global maps are declared inline on purpose: it keeps the dev dependency
 * list short and makes the runtime surface of each layer explicit.
 */
import js from "@eslint/js";

/** Browser runtime used by src/. */
const browserGlobals = Object.fromEntries(
    [
        "window",
        "document",
        "navigator",
        "location",
        "history",
        "localStorage",
        "sessionStorage",
        "fetch",
        "console",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "URL",
        "URLSearchParams",
        "AbortController",
        "AbortSignal",
        "Blob",
        "File",
        "FileReader",
        "FormData",
        "Event",
        "CustomEvent",
        "KeyboardEvent",
        "MouseEvent",
        "DragEvent",
        "HTMLElement",
        "Node",
        "NodeList",
        "structuredClone",
        "Intl",
        "TextEncoder",
        "TextDecoder",
        "crypto",
        "matchMedia",
        "getComputedStyle",
        "alert",
        "confirm",
        "prompt"
    ].map((name) => [name, "readonly"])
);

/** Node runtime used by scripts/ and tests/. */
const nodeGlobals = Object.fromEntries(
    [
        "process",
        "console",
        "URL",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "structuredClone",
        "fetch",
        "AbortController",
        "Buffer",
        "__dirname",
        "__filename"
    ].map((name) => [name, "readonly"])
);

/** Rules shared by every layer. */
const sharedRules = {
    "no-unused-vars": [
        "error",
        {
            vars: "all",
            args: "after-used",
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrors: "none"
        }
    ],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-console": "off",
    eqeqeq: ["error", "smart"],
    "no-var": "error",
    "prefer-const": "error",
    "no-shadow": "error",
    "no-return-await": "error",
    "no-throw-literal": "error",
    "no-template-curly-in-string": "error",
    "no-implicit-globals": "error"
};

export default [
    {
        ignores: ["dist/", "node_modules/", "coverage/", "public/", "assets/", "*.min.js"]
    },

    js.configs.recommended,

    // ---------------------------------------------------------- browser app
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: browserGlobals
        },
        rules: {
            ...sharedRules,
            // DOM code legitimately reads a lot of properties off nullable nodes;
            // those paths are guarded at boot by assertElements().
            "no-unsafe-optional-chaining": "error"
        }
    },

    // --------------------------------------------- build scripts & dev tooling
    {
        files: ["scripts/**/*.mjs", "*.config.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: nodeGlobals
        },
        rules: sharedRules
    },

    // ------------------------------------------------------------------ tests
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...nodeGlobals, ...browserGlobals }
        },
        rules: sharedRules
    }
];
