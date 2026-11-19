/**
 * Conversation history handling for Module 04.
 *
 * Kept separate from `modules/comms.js` so the trimming policy can be unit
 * tested without a DOM.
 */

/**
 * Drops the oldest turns so the request payload — and its token cost — stays
 * bounded. The array is mutated in place, never re-assigned, because
 * `state.chatHistory` is referenced directly by the outgoing payload.
 *
 * @template {{ role: string, parts: unknown[] }} T
 * @param {T[]} history
 * @param {number} maxMessages
 * @returns {T[]} the same array instance
 */
export function trimChatHistory(history, maxMessages) {
    if (!Array.isArray(history)) return history;

    const limit = Number(maxMessages);
    if (!Number.isFinite(limit) || limit <= 0) return history;

    while (history.length > limit) history.shift();
    return history;
}
