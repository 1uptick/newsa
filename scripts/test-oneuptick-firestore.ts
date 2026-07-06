/**
 * One-off: verify 1uptick Firestore market data reads (run: npx tsx scripts/test-oneuptick-firestore.ts)
 */
import {
  readMarketMapFromOneuptickFirestore,
  readMoversFromOneuptickFirestore,
} from "../server/oneuptickMarketDataCache.js";
import { isOneuptickFirestoreConfigured } from "../server/oneuptickFirestore.js";

async function main() {
  console.log("configured:", isOneuptickFirestoreConfigured());
  if (!isOneuptickFirestoreConfigured()) {
    console.error("ONEUPTICK_FIREBASE_SERVICE_ACCOUNT(_PATH) not set");
    process.exit(1);
  }

  const map = await readMarketMapFromOneuptickFirestore();
  if (!map) {
    console.error("FAIL: market map returned null");
    process.exit(1);
  }
  console.log(
    "OK market map:",
    map.indexes.length,
    "indices, lastUpdated",
    new Date(map.lastUpdated).toISOString()
  );
  console.log(
    "  sample:",
    map.indexes
      .slice(0, 3)
      .map((i) => `${i.shortName} ${i.changesPercentage.toFixed(2)}%`)
      .join(", ")
  );

  for (const cat of ["stocks", "forex", "commodities", "crypto"] as const) {
    const m = await readMoversFromOneuptickFirestore(cat, "^GSPC");
    if (!m) {
      console.error("FAIL movers", cat);
      continue;
    }
    console.log(
      `OK movers ${cat}: ${m.gainers.length} gainers, ${m.losers.length} losers, updated ${new Date(m.lastUpdated).toISOString()}`
    );
  }
}

main().catch((e) => {
  console.error("ERROR", e instanceof Error ? e.message : e);
  process.exit(1);
});
