#!/usr/bin/env node
/**
 * Rasterises the SVG brand sources in assets/brand/ into the PNGs that
 * public/ ships (PWA icons + Open Graph image).
 *
 * The generated PNGs are committed, so this script is only needed when the
 * branding changes. It requires an optional dependency:
 *
 *     npm install --no-save @resvg/resvg-js
 *     npm run assets
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const TARGETS = [
    { src: "assets/brand/icon.svg", out: "public/icon-192.png", width: 192 },
    { src: "assets/brand/icon.svg", out: "public/icon-512.png", width: 512 },
    { src: "assets/brand/og-image.svg", out: "public/og-image.png", width: 1200 }
];

let Resvg;
try {
    ({ Resvg } = await import("@resvg/resvg-js"));
} catch {
    console.error(
        "Missing optional dependency @resvg/resvg-js.\n" +
            "  npm install --no-save @resvg/resvg-js\n" +
            "  npm run assets"
    );
    process.exit(1);
}

for (const target of TARGETS) {
    const svg = await readFile(path.join(ROOT, target.src), "utf8");
    const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: target.width },
        background: "rgba(0, 0, 0, 0)"
    });
    const png = resvg.render().asPng();
    await writeFile(path.join(ROOT, target.out), png);
    console.log(`  ✓ ${target.out} (${(png.byteLength / 1024).toFixed(1)} KB, ${target.width}px wide)`);
}

console.log("Brand assets generated.");
