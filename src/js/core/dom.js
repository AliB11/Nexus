/**
 * DOM element references, resolved once at boot.
 *
 * Every id used by the application is declared here so modules never sprinkle
 * `document.getElementById` calls through their logic.
 */
// -----------------------------------------------------------------
// DOM ELEMENT REFERENCES
// -----------------------------------------------------------------
export const els = {
    utcClock: document.getElementById("utcClock"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    navTabs: document.querySelectorAll(".nav-tab"),
    panels: document.querySelectorAll(".module-panel"),
    globalError: document.getElementById("globalError"),
    globalErrorText: document.getElementById("globalErrorText"),
    dismissErrorBtn: document.getElementById("dismissErrorBtn"),
    toastContainer: document.getElementById("toastContainer"),

    // Dossiers
    dossierList: document.getElementById("dossierList"),
    dossierCount: document.getElementById("dossierCount"),

    // Module 1: OSINT Briefing
    briefingForm: document.getElementById("briefingForm"),
    briefingTopic: document.getElementById("briefingTopic"),
    briefingFocus: document.getElementById("briefingFocus"),
    generateBriefingBtn: document.getElementById("generateBriefingBtn"),
    presetBtns: document.querySelectorAll(".preset-btn"),
    briefingLoader: document.getElementById("briefingLoader"),
    briefingOutput: document.getElementById("briefingOutput"),
    briefingEmpty: document.getElementById("briefingEmpty"),
    briefingBadgeFocus: document.getElementById("briefingBadgeFocus"),
    briefingTimestamp: document.getElementById("briefingTimestamp"),
    briefingResultTitle: document.getElementById("briefingResultTitle"),
    briefingContent: document.getElementById("briefingContent"),
    briefingSourcesCard: document.getElementById("briefingSourcesCard"),
    sourcesCountBadge: document.getElementById("sourcesCountBadge"),
    briefingSourcesGrid: document.getElementById("briefingSourcesGrid"),
    sendToMatrixBtn: document.getElementById("sendToMatrixBtn"),
    saveDossierBtn: document.getElementById("saveDossierBtn"),
    copyBriefingBtn: document.getElementById("copyBriefingBtn"),

    // Module 2: Signal Matrix
    matrixForm: document.getElementById("matrixForm"),
    matrixInput: document.getElementById("matrixInput"),
    matrixCharCount: document.getElementById("matrixCharCount"),
    extractMatrixBtn: document.getElementById("extractMatrixBtn"),
    loadSampleTextBtn: document.getElementById("loadSampleTextBtn"),
    matrixLoader: document.getElementById("matrixLoader"),
    matrixOutput: document.getElementById("matrixOutput"),
    matrixThreatBadge: document.getElementById("matrixThreatBadge"),
    matrixSentiment: document.getElementById("matrixSentiment"),
    matrixConfidenceVal: document.getElementById("matrixConfidenceVal"),
    matrixConfidenceBar: document.getElementById("matrixConfidenceBar"),
    matrixHeadline: document.getElementById("matrixHeadline"),
    matrixEntitiesGrid: document.getElementById("matrixEntitiesGrid"),
    matrixOpportunitiesList: document.getElementById("matrixOpportunitiesList"),
    matrixRisksList: document.getElementById("matrixRisksList"),
    matrixActionsList: document.getElementById("matrixActionsList"),

    // Module 3: Visual Intel
    dropzone: document.getElementById("dropzone"),
    dropzonePlaceholder: document.getElementById("dropzonePlaceholder"),
    visualFileInput: document.getElementById("visualFileInput"),
    visualPreviewImg: document.getElementById("visualPreviewImg"),
    visualFileMeta: document.getElementById("visualFileMeta"),
    visualFileName: document.getElementById("visualFileName"),
    clearVisualBtn: document.getElementById("clearVisualBtn"),
    visualForm: document.getElementById("visualForm"),
    visualMode: document.getElementById("visualMode"),
    visualPrompt: document.getElementById("visualPrompt"),
    analyzeVisualBtn: document.getElementById("analyzeVisualBtn"),
    visualLoader: document.getElementById("visualLoader"),
    visualOutputCard: document.getElementById("visualOutputCard"),
    visualOutputContent: document.getElementById("visualOutputContent"),
    copyVisualBtn: document.getElementById("copyVisualBtn"),

    // Module 4: Analyst Comms
    chatForm: document.getElementById("chatForm"),
    chatInput: document.getElementById("chatInput"),
    chatSendBtn: document.getElementById("chatSendBtn"),
    chatMessages: document.getElementById("chatMessages"),
    chatGroundingToggle: document.getElementById("chatGroundingToggle"),
    clearChatBtn: document.getElementById("clearChatBtn"),

    // Engine status + API key settings (v2 shell)
    engineModelLabel: document.getElementById("engineModelLabel"),
    apiKeyStatusChip: document.getElementById("apiKeyStatusChip"),
    apiKeySettingsBtn: document.getElementById("apiKeySettingsBtn"),
    apiKeyModal: document.getElementById("apiKeyModal"),
    apiKeyModalCard: document.getElementById("apiKeyModalCard"),
    apiKeyProviderSelect: document.getElementById("apiKeyProviderSelect"),
    apiKeyProviderNote: document.getElementById("apiKeyProviderNote"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    apiKeyKeyHint: document.getElementById("apiKeyKeyHint"),
    apiKeyBaseUrlInput: document.getElementById("apiKeyBaseUrlInput"),
    apiKeyModelInput: document.getElementById("apiKeyModelInput"),
    apiKeyModelOptions: document.getElementById("apiKeyModelOptions"),
    apiKeyTestBtn: document.getElementById("apiKeyTestBtn"),
    apiKeyTestResult: document.getElementById("apiKeyTestResult"),
    apiKeySaveBtn: document.getElementById("apiKeySaveBtn"),
    apiKeyCancelBtn: document.getElementById("apiKeyCancelBtn"),
    apiKeyClearBtn: document.getElementById("apiKeyClearBtn"),
    apiKeyModalHint: document.getElementById("apiKeyModalHint")
};

/**
 * Shortcut for `document.getElementById`.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export function byId(id) {
    return document.getElementById(id);
}

/**
 * Fails fast with a readable message when a required element is missing from
 * `index.html`. Called once during boot so DOM drift is caught immediately
 * instead of surfacing as a random `null` TypeError later.
 * @param {Record<string, HTMLElement | null>} refs
 * @param {string[]} required
 */
export function assertElements(refs, required) {
    const missing = required.filter((key) => !refs[key]);
    if (missing.length > 0) {
        throw new Error(`راه‌اندازی NEXUS ناموفق بود. گره(های) DOM موجود نیست: ${missing.join(", ")}`);
    }
}
