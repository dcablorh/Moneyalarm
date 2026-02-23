import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

// CoinMarketCap API
const CMC_BASE = "https://pro-api.coinmarketcap.com";
const CMC_KEY = process.env.COINMARKETCAP_API_KEY ?? "";

function cmcHeaders() {
  return { "Accept": "application/json", "X-CMC_PRO_API_KEY": CMC_KEY };
}

function getCoinImage(cmcId: number): string {
  return `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`;
}

// In-memory cache: lowercase query → coin info.
// id is the CMC numeric id as a string (e.g. "1" for Bitcoin).
type CoinInfo = { id: string; name: string; symbol: string; image: string };
const coinCache = new Map<string, CoinInfo>();

async function lookupCoin(query: string): Promise<CoinInfo | null> {
  const key = query.toLowerCase().trim();
  const cached = coinCache.get(key);
  if (cached) return cached;

  // Try as symbol first, then as slug (lowercase name like "bitcoin")
  const urls = [
    `${CMC_BASE}/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(query.toUpperCase())}&convert=USD`,
    `${CMC_BASE}/v2/cryptocurrency/quotes/latest?slug=${encodeURIComponent(key)}&convert=USD`,
  ];

  for (const url of urls) {
    const resp = await fetch(url, { headers: cmcHeaders() });
    if (!resp.ok) continue;

    const json = await resp.json();
    if (json.status?.error_code !== 0) continue;

    const entries = Object.values(json.data ?? {}) as any[][];
    const firstArr = entries[0];
    if (!firstArr) continue;

    const asset = Array.isArray(firstArr) ? firstArr[0] : firstArr;
    if (!asset) continue;

    const coin: CoinInfo = {
      id: String(asset.id),
      name: asset.name,
      symbol: asset.symbol,
      image: getCoinImage(asset.id),
    };
    coinCache.set(key, coin);
    coinCache.set(asset.symbol.toLowerCase(), coin);
    coinCache.set((asset.slug ?? asset.name).toLowerCase(), coin);
    return coin;
  }

  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Fetch price for a single token by name or symbol (e.g. "Bitcoin" or "BTC")
  app.get("/api/price/:query", async (req, res) => {
    const { query } = req.params;

    try {
      const coin = await lookupCoin(query);
      if (!coin) {
        return res.status(404).json({ error: "Cryptocurrency not found" });
      }

      const priceResp = await fetch(
        `${CMC_BASE}/v2/cryptocurrency/quotes/latest?id=${encodeURIComponent(coin.id)}&convert=USD`,
        { headers: cmcHeaders() }
      );

      if (!priceResp.ok) {
        return res.status(priceResp.status).json({ error: "Failed to fetch price data" });
      }

      const priceJson = await priceResp.json();
      const asset = priceJson.data?.[coin.id];

      if (!asset) {
        return res.status(404).json({ error: "Price data not available" });
      }

      res.json({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image,
        price: asset.quote.USD.price,
        lastUpdated: asset.quote.USD.last_updated,
      });
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price data" });
    }
  });

  // Batch price fetch — one API call for all active alerts
  // Usage: GET /api/prices?ids=1,1027,5426   (CMC numeric ids)
  app.get("/api/prices", async (req, res) => {
    const { ids } = req.query;
    if (!ids || typeof ids !== "string") {
      return res.status(400).json({ error: "ids query parameter required" });
    }

    try {
      const response = await fetch(
        `${CMC_BASE}/v2/cryptocurrency/quotes/latest?id=${encodeURIComponent(ids)}&convert=USD`,
        { headers: cmcHeaders() }
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch prices" });
      }

      const data = await response.json();
      const result: Record<string, { price: number; lastUpdated: string }> = {};

      for (const [id, asset] of Object.entries(data.data ?? {}) as [string, any][]) {
        result[id] = {
          price: (asset as any).quote.USD.price,
          lastUpdated: (asset as any).quote.USD.last_updated,
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching prices:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
