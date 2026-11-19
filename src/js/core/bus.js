/**
 * Minimal action registry (a tiny, dependency-free event bus).
 *
 * Modules publish the actions they can perform and invoke actions owned by
 * other modules without importing them. This keeps the dependency graph acyclic:
 * `services/dossiers.js` can open a briefing, and `modules/briefing.js` can push
 * text into the Signal Matrix, without either importing the other.
 */

/** @type {Map<string, Function>} */
const registry = new Map();

/**
 * Registers an action handler.
 * @param {string} name Unique action name, e.g. `"briefing:render"`.
 * @param {Function} handler
 */
export function registerAction(name, handler) {
    registry.set(name, handler);
}

/**
 * Invokes a registered action.
 * @param {string} name
 * @param {...*} args
 * @throws {Error} when the action was never registered.
 */
export function invokeAction(name, ...args) {
    const handler = registry.get(name);
    if (!handler) throw new Error(`Unknown NEXUS action: ${name}`);
    return handler(...args);
}

/**
 * Invokes an action when it exists, otherwise resolves to `undefined`.
 * Used by low-level layers (e.g. the API client) that must not hard-depend on UI.
 * @param {string} name
 * @param {...*} args
 */
export function tryInvokeAction(name, ...args) {
    const handler = registry.get(name);
    return handler ? handler(...args) : undefined;
}
