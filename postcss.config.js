/**
 * PostCSS pipeline used by the Tailwind CLI build.
 * Autoprefixer keeps the compiled stylesheet safe on older Safari/WebKit.
 */
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {}
    }
};
