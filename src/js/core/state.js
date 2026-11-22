/**
 * NEXUS central application state — a single mutable store shared by all modules.
 *
 * Kept deliberately framework-free: modules import this object and mutate it,
 * then re-render the slice of DOM they own.
 */
export const state = {
    activeTab: "briefing",
    currentBriefing: null, // { id, topic, focus, timestamp, rawText, sources }
    dossiers: [],
    visualImage: null, // { base64, mimeType, fileName }
    visualReportText: "",
    chatHistory: [] // neutral request turns: [{ role: "user" | "assistant", text }]
};
