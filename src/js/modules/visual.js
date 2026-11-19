/**
 * Module 03 — Visual Intel.
 *
 * Accepts a PNG/JPEG/WebP upload (picker, drag & drop), encodes it as base64
 * `inlineData` and asks the model to brief, extract chart data, OCR a document
 * or hunt for anomalies.
 */
import { config } from "../config.js";
import { els } from "../core/dom.js";
import { state } from "../core/state.js";
import { api } from "../api/client.js";
import { renderMarkdown } from "../core/markdown.js";
import { copyToClipboard } from "../core/clipboard.js";
import { hideError, showError, showToast } from "../core/toast.js";
import { blockReason, firstText } from "../api/gemini.js";
import { buildVisualPrompt } from "../core/prompts.js";
import { formatFileSize } from "../core/format.js";
export function handleImageFile(file) {
    if (!file) return;
    if (!config.limits.imageMimeTypes.includes(file.type)) {
        showToast("Please upload a PNG, JPG, or WEBP image.", "error");
        return;
    }
    if (file.size > config.limits.imageMaxBytes) {
        showToast(`Image must be smaller than ${Math.round(config.limits.imageMaxBytes / (1024 * 1024))}MB.`, "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
        const dataUrl = evt.target.result;
        const base64Data = dataUrl.split(",")[1];
        state.visualImage = {
            base64: base64Data,
            mimeType: file.type,
            fileName: file.name
        };

        els.visualPreviewImg.src = dataUrl;
        els.visualPreviewImg.classList.remove("hidden");
        els.dropzonePlaceholder.classList.add("hidden");
        els.visualFileMeta.classList.remove("hidden");
        els.visualFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        els.analyzeVisualBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

export function clearVisualImage() {
    state.visualImage = null;
    els.visualFileInput.value = "";
    els.visualPreviewImg.src = "";
    els.visualPreviewImg.classList.add("hidden");
    els.dropzonePlaceholder.classList.remove("hidden");
    els.visualFileMeta.classList.add("hidden");
    els.analyzeVisualBtn.disabled = true;
}

export async function handleVisualSubmit(e) {
    e.preventDefault();
    hideError();
    if (!state.visualImage) return;

    const finalPrompt = buildVisualPrompt({
        mode: els.visualMode.value,
        customQuery: els.visualPrompt.value.trim()
    });

    els.analyzeVisualBtn.disabled = true;
    els.visualOutputCard.classList.add("hidden");
    els.visualLoader.classList.remove("hidden");

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: finalPrompt },
                    {
                        inlineData: {
                            mimeType: state.visualImage.mimeType,
                            data: state.visualImage.base64
                        }
                    }
                ]
            }
        ]
    };

    try {
        const result = await api.generate(payload);
        const text = firstText(result);
        if (!text) {
            const blocked = blockReason(result);
            throw new Error(
                blocked
                    ? `The model blocked this image analysis (finish reason: ${blocked}).`
                    : "No visual intelligence findings were returned."
            );
        }
        state.visualReportText = text;
        els.visualOutputContent.innerHTML = renderMarkdown(text);
        els.visualOutputCard.classList.remove("hidden");
    } catch (err) {
        showError(`Visual analysis failed: ${err.message}`);
    } finally {
        els.visualLoader.classList.add("hidden");
        els.analyzeVisualBtn.disabled = false;
    }
}

/**
 * Wires Module 03, including drag & drop on the dropzone.
 */
export function initVisual() {
    els.visualFileInput.addEventListener("change", (e) => handleImageFile(e.target.files[0]));
    els.clearVisualBtn.addEventListener("click", clearVisualImage);
    els.visualForm.addEventListener("submit", handleVisualSubmit);
    els.copyVisualBtn.addEventListener("click", () => {
        if (state.visualReportText) copyToClipboard(state.visualReportText);
    });

    // Drag & Drop support for Visual Intel
    ["dragenter", "dragover"].forEach((evtName) => {
        els.dropzone.addEventListener(evtName, (e) => {
            e.preventDefault();
            els.dropzone.classList.add("border-cyan-500", "bg-cyan-500/5");
        });
    });
    ["dragleave", "drop"].forEach((evtName) => {
        els.dropzone.addEventListener(evtName, (e) => {
            e.preventDefault();
            els.dropzone.classList.remove("border-cyan-500", "bg-cyan-500/5");
        });
    });
    els.dropzone.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) handleImageFile(file);
    });
}
