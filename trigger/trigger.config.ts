import { defineConfig } from "@trigger.dev/sdk";
import { aptGet } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger", "./src/clients"],
  build: {
    external: ["pdf2pic", "sharp", "pdfjs-dist"],
    extensions: [
      aptGet({
        packages: ["poppler-utils", "graphicsmagick"],
      }),
    ],
  },
});
