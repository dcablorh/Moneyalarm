import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy for CoinMarketCap API to keep the API key secret
  app.get("/api/price/:symbol", async (req, res) => {
    const { symbol } = req.params;
    const apiKey = process.env.COINMARKETCAP_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "COINMARKETCAP_API_KEY is not configured" });
    }

    try {
      const response = await fetch(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol.toUpperCase()}`,
        {
          headers: {
            "X-CMC_PRO_API_KEY": apiKey,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      let cryptoData = data.data[symbol.toUpperCase()];

      // If multiple tokens share the same symbol, CMC returns an array
      if (Array.isArray(cryptoData)) {
        cryptoData = cryptoData[0];
      }

      if (!cryptoData) {
        return res.status(404).json({ error: "Cryptocurrency not found" });
      }

      res.json({
        id: cryptoData.id,
        symbol: cryptoData.symbol,
        name: cryptoData.name,
        price: cryptoData.quote.USD.price,
        lastUpdated: cryptoData.quote.USD.last_updated,
      });
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price data" });
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
