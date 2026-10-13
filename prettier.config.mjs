/** @type {import("prettier").Config} */
export default {
  // Every text file uses LF (see also .gitattributes and files.eol in .vscode/settings.json).
  endOfLine: "lf",

  // prettier-plugin-tailwindcss must be the last plugin: it sorts class attributes and
  // @apply lists in Tailwind's canonical order. It reads tailwind.config.cjs (Tailwind 3).
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  tailwindConfig: "./tailwind.config.cjs",

  overrides: [
    {
      files: "*.astro",
      options: { parser: "astro" },
    },
  ],
};
