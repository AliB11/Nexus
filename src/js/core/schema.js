/**
 * The Module 02 structured-output contract.
 *
 * This is the *data* agreement between NEXUS and the Gemini API, so it lives in
 * `core/` next to the prompts rather than inside `modules/matrix.js`: it must be
 * reviewable, diffable and testable without a DOM.
 *
 * LANGUAGE: field names and the `threatLevel` / `sentiment` / `category` enum
 * values stay English — they are part of the API contract and of any data
 * already archived in localStorage. Free-text fields are requested in Persian,
 * and `core/labels.js` translates the enums at render time.
 */

/** @type {Record<string, object>} */
export const MATRIX_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        headline: { type: "STRING", description: "Persian headline summarising the assessment" },
        threatLevel: { type: "STRING", description: "One of: Low, Moderate, Elevated, Critical" },
        sentiment: { type: "STRING", description: "One of: Positive, Neutral, Negative, Mixed" },
        confidenceScore: { type: "NUMBER", description: "Confidence score from 0 to 100" },
        entities: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING", description: "Entity name; keep proper nouns in their original script" },
                    category: {
                        type: "STRING",
                        description: "One of: Organization, Person, Location, Technology, Regulation"
                    },
                    relevance: { type: "STRING", description: "Why this entity matters, in Persian" }
                },
                propertyOrdering: ["name", "category", "relevance"]
            }
        },
        strengthsOrOpportunities: {
            type: "ARRAY",
            items: { type: "STRING", description: "Persian" }
        },
        risksOrThreats: {
            type: "ARRAY",
            items: { type: "STRING", description: "Persian" }
        },
        actionItems: {
            type: "ARRAY",
            items: { type: "STRING", description: "Persian, imperative" }
        }
    },
    propertyOrdering: [
        "headline",
        "threatLevel",
        "sentiment",
        "confidenceScore",
        "entities",
        "strengthsOrOpportunities",
        "risksOrThreats",
        "actionItems"
    ]
};
