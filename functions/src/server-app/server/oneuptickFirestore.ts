/**
 * Firestore client for the 1uptick app Firebase project (uptick-prod).
 * Used read-only for centralized market map / movers caches warmed by 1uptick Cloud Functions.
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { config } from "./config.js";

const APP_NAME = "oneuptick-market-data";

let initAttempted = false;

export function isOneuptickFirestoreConfigured(): boolean {
  return Boolean(config.oneuptickFirebase.serviceAccountJson);
}

export function getOneuptickFirestore(): Firestore | null {
  if (!config.oneuptickFirebase.serviceAccountJson) return null;

  if (!initAttempted) {
    initAttempted = true;
    try {
      const existing = admin.apps.find((a) => a?.name === APP_NAME);
      if (!existing) {
        const serviceAccount = JSON.parse(config.oneuptickFirebase.serviceAccountJson);
        admin.initializeApp(
          {
            credential: admin.credential.cert(serviceAccount),
          },
          APP_NAME
        );
        const projectId = (serviceAccount as { project_id?: string }).project_id ?? "unknown";
        console.log(`1uptick Firestore initialized (project: ${projectId}).`);
      }
    } catch (e) {
      console.error("1uptick Firestore: failed to initialize", e);
      return null;
    }
  }

  const app = admin.apps.find((a) => a?.name === APP_NAME);
  if (!app) return null;
  return admin.firestore(app);
}
