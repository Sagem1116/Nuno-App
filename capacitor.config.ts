import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.e47c44ff4b4940038b97ec9f1afd376",
  appName: "Nuno App",
  webDir: "dist",
  // Hot-reload from Lovable preview while developing.
  // For a production build, COMMENT OUT the `server` block,
  // run `bun run build`, then `npx cap sync`.
  server: {
    url: "https://e47c44ff-4b49-4003-89b9-7ec9f1afd376.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    backgroundColor: "#0a0a0f",
  },
};

export default config;
