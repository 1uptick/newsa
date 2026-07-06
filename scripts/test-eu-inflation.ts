import "dotenv/config";
import { config } from "../server/config.ts";
import { generateEconomicChartDataUrl } from "../server/economicChart.ts";
import { fetchCalendarReleaseSeries } from "../server/fmpEconomicCalendarSeries.ts";

async function main() {
  const key = config.fmp.apiKey;
  const from = "2023-01-01";
  const to = "2026-06-01";
  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${key}`;
  const d = await fetch(url).then((r) => r.json());
  const arr = Array.isArray(d) ? d : [];
  for (const code of ["EU", "DE", "US"]) {
    const n = arr.filter(
      (e: Record<string, unknown>) =>
        String(e.country ?? "").toUpperCase() === code && /inflation|cpi/i.test(String(e.event ?? ""))
    ).length;
    console.log(code, "inflation events:", n);
  }

  for (const country of ["EU", "DE"]) {
    const pts = await fetchCalendarReleaseSeries({
      country,
      eventPattern: /inflation|cpi/i,
      preferEventPrefix: "Inflation Rate YoY",
      fromDate: "2024-01-01",
      toDate: "2026-06-01",
    });
    console.log(country, "series points:", pts.length, pts.slice(-3));
  }

  const us = await generateEconomicChartDataUrl({
    source: "us_series",
    indicator: "inflationRate",
    title: "US Inflation",
    chartType: "bar",
    months: 24,
  });
  console.log("US inflation chart:", us ? us.length : "FAILED");
}

main().catch(console.error);
