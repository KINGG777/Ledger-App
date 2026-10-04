// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Prebundle the UI packages used by the authenticated screens at startup.
    // Discovering Radix after sign-in forces an optimizer reload mid-render,
    // which can leave the dialog using a stale React hook dispatcher in preview.
    optimizeDeps: {
      include: [
        "@radix-ui/react-dialog",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-label",
        "@radix-ui/react-select",
        "@radix-ui/react-switch",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
