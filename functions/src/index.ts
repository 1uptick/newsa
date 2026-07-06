/**
 * Firebase Cloud Functions v2 — API handler.
 * Rewrite /api/* from Hosting to this function.
 * Lazy-load the server on first request so the runtime can bind to PORT immediately.
 */
import { onRequest } from "firebase-functions/v2/https";

let appPromise: Promise<{ app: unknown }> | null = null;
function getApp() {
  if (!appPromise) appPromise = import("./server-app/server/index.js");
  return appPromise;
}

export const api = onRequest(
  /**
   * Article generation can be long-running (research + writing + translation + Airtable).
   * Increase resources to reduce truncation/timeouts in production.
   */
  {
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 300,
    invoker: "public",
    /**
     * PERPLEXITY_API_KEY is stored in Secret Manager (set via `firebase functions:secrets:set`).
     * It must be declared here so Cloud Run exposes it as process.env.PERPLEXITY_API_KEY.
     */
    secrets: ["PERPLEXITY_API_KEY"],
  },
  async (req, res) => {
    const { app } = await getApp();
    (app as import("express").Express)(req, res);
  }
);
