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
 * After trimming, any leading non-`user` turns are dropped as well. Without
 * this, a history trimmed mid-pair starts with the assistant's reply — and the
 * Gemini transport (`generateContent`) rejects a `contents` array whose first
 * role is `model`, turning every later chat turn into a 400.
 *
 * @template {{ role: string, parts?: unknown[] }} T
 * @param {T[]} history
 * @param {number} maxMessages
 * @returns {T[]} the same array instance
 */
export function trimChatHistory(history, maxMessages) {
    if (!Array.isArray(history)) return history;

    const limit = Number(maxMessages);
    if (!Number.isFinite(limit) || limit <= 0) return history;

    while (history.length > limit) history.shift();
    while (history.length > 0 && history[0].role !== "user") history.shift();
    return history;
}
