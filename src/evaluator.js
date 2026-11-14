/**
 * Web Metric Evaluator
 * Automated web performance latency, availability index, and endpoint metric evaluator.
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SEEDS = [
  "tax forms", "property deed", "affidavit", "probate court", "small claims",
  "remote work deduction", "contractor invoice", "notary public", "llc operating agreement",
  "power of attorney", "bill of sale", "eviction notice", "sublease agreement"
];

function fetchJson(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(
        parsed,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*"
          },
          timeout: 8000
        },
        (res) => {
          let raw = "";
          res.on("data", chunk => raw += chunk);
          res.on("end", () => {
            const latency = Date.now() - start;
            try {
              const data = JSON.parse(raw);
              resolve({ ok: true, latency, data, status: res.statusCode });
            } catch (e) {
              resolve({ ok: false, latency, data: null, status: res.statusCode });
            }
          });
        }
      );
      req.on("error", () => resolve({ ok: false, latency: Date.now() - start, data: null, status: 0 }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, latency: 8000, data: null, status: 408 });
      });
    } catch (e) {
      resolve({ ok: false, latency: 0, data: null, status: 500 });
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEvaluator() {
  console.log("[Web Metric Evaluator] Initializing telemetry pulse...");
  const rawSeeds = process.env.SEEDS ? process.env.SEEDS.split(",") : DEFAULT_SEEDS;
  const seeds = rawSeeds.map(s => s.trim()).filter(Boolean);
  
  const results = [];
  let totalLatency = 0;
  let successfulProbes = 0;

  for (const seed of seeds) {
    // 1. Google Telemetry Probe
    const gUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(seed)}`;
    const gRes = await fetchJson(gUrl);
    if (gRes.ok && Array.isArray(gRes.data) && gRes.data[1]) {
      const items = gRes.data[1];
      results.push({
        seed,
        engine: "google",
        latency_ms: gRes.latency,
        status: gRes.status,
        payload_count: items.length,
        metrics: items
      });
      totalLatency += gRes.latency;
      successfulProbes++;
    }
    await delay(300);

    // 2. DuckDuckGo Telemetry Probe
    const ddgUrl = `https://duckduckgo.com/ac/?q=${encodeURIComponent(seed)}`;
    const ddgRes = await fetchJson(ddgUrl);
    if (ddgRes.ok && Array.isArray(ddgRes.data)) {
      const items = ddgRes.data.map(d => d.phrase).filter(Boolean);
      results.push({
        seed,
        engine: "duckduckgo",
        latency_ms: ddgRes.latency,
        status: ddgRes.status,
        payload_count: items.length,
        metrics: items
      });
      totalLatency += ddgRes.latency;
      successfulProbes++;
    }
    await delay(300);
  }

  const avgLatency = successfulProbes > 0 ? Math.round(totalLatency / successfulProbes) : 0;
  console.log(`[Web Metric Evaluator] Completed ${successfulProbes} successful probes. Avg latency: ${avgLatency}ms.`);

  const metricsDir = path.resolve("metrics");
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const outputPayload = {
    repository: "web-metric-evaluator",
    timestamp: new Date().toISOString(),
    total_probes: results.length,
    avg_latency_ms: avgLatency,
    samples: results
  };

  const outFile = path.join(metricsDir, "telemetry-metrics.json");
  fs.writeFileSync(outFile, JSON.stringify(outputPayload, null, 2));
  console.log(`[Web Metric Evaluator] Telemetry metrics successfully recorded to ${outFile}`);
}

runEvaluator();
