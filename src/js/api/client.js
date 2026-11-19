/**
 * The shared Gemini client instance used by every module.
 *
 * Key and model are read lazily on each request, so saving new values in the
 * Settings dialog takes effect immediately — no reload, no re-wiring.
 */
import { createGeminiClient } from "./gemini.js";
import { getApiKey, getModel } from "../services/settings.js";

export const api = createGeminiClient({ getApiKey, getModel });
