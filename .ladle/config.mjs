/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/components/design/**/*.stories.{ts,tsx}",
  viteConfig: "vite.config.ts",
  defaultStory: "colors--default",
  addons: {
    theme: {
      enabled: true,
      defaultState: "dark",
    },
    width: {
      enabled: true,
      options: { xsmall: 720, small: 1024, medium: 1280, large: 1440 },
      defaultState: 1280,
    },
    a11y: { enabled: false },
    rtl: { enabled: false },
    source: { enabled: true },
    action: { enabled: false, defaultState: [] },
    control: { enabled: true, defaultState: {} },
    ladle: { enabled: true },
    mode: { enabled: true, defaultState: "full" },
  },
};
