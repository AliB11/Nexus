/**
 * Header telemetry clock (UTC, one tick per second).
 */
import { els } from "./dom.js";
import { formatUtcClock } from "./format.js";
/**
 * Updates the header UTC telemetry clock every second.
 */
export function updateClock(now = new Date()) {
    if (els.utcClock) els.utcClock.textContent = formatUtcClock(now);
}

/**
 * Starts the UTC clock and keeps it ticking.
 * @param {number} [intervalMs=1000]
 * @returns {number} The interval handle, so tests can clear it.
 */
export function startClock(intervalMs = 1000) {
    updateClock();
    return setInterval(updateClock, intervalMs);
}
