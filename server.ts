import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Data.go.kr API Proxy
  app.get("/api/apt-trade", async (req, res) => {
    try {
      const { lawdCd, dealYmd } = req.query;
      const serviceKey = process.env.DATA_GO_KR_API_KEY || "1364ed5983d138b2f6fb21d096324f87cf8cfecf8087a28f9a9a18215375d06e";
      
      // Reverting to the more common apis.data.go.kr endpoint which is usually more stable across networks
      const baseUrl = `http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`;
      
      const url = `${baseUrl}?serviceKey=${serviceKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}`;
      
      console.log(`[PROXY] Requesting Trade Data: ${lawdCd} for ${dealYmd}`);
      
      const response = await axios.get(url, {
        responseType: 'text',
        timeout: 30000,
        headers: {
          'Accept': 'application/xml',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const data = response.data?.trim();
      
      // If we get an error or HTML, it might be an invalid key or service down
      if (!data || !data.startsWith('<')) {
        console.error("[PROXY] Invalid Response Format (not XML):", data?.substring(0, 300));
        return res.status(500).json({ 
          error: "INVALID_API_RESPONSE", 
          details: "공공데이터 포털에서 올바른 형식이 아닌 응답을 보냈습니다. 서비스키(Service Key)가 유효하고 승인 상태인지 확인이 필요합니다.",
          raw: data?.substring(0, 100)
        });
      }

      const result = await parseStringPromise(data);
      
      if (!result || !result.response) {
        console.error("[PROXY] Malformed XML - missing response tag:", data.substring(0, 300));
        return res.status(500).json({
          error: "MALFORMED_XML",
          details: "공공데이터 응답 형식이 올바르지 않습니다."
        });
      }

      const header = result.response?.header?.[0];
      const resultCode = header?.resultCode?.[0];
      const resultMsg = header?.resultMsg?.[0];

      if (resultCode !== '00' && resultCode !== '000') {
        console.error("[PROXY] API Error Code:", resultCode, "Message:", resultMsg);
        return res.status(400).json({ 
          error: "API_REJECTION", 
          code: resultCode,
          message: resultMsg || "알 수 없는 API 오류"
        });
      }

      const body = result.response?.body?.[0];
      const items = body?.items?.[0]?.item || [];
      console.log(`[PROXY] Success! Found ${items.length} records for ${dealYmd}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("[PROXY] Fatal Error:", error.message);
      res.status(500).json({ 
        error: "PROXY_FATAL_ERROR", 
        details: error.message,
        hint: "네트워크 연결 또는 공공데이터 서버 응답 대기 시간이 초과되었습니다."
      });
    }
  });

  // Geocoding Proxy (using Photon for better Korean support and no strict rate limit)
  app.get("/api/geocode", async (req, res) => {
    try {
      const { q, lat, lon } = req.query;
      let url = "https://photon.komoot.io/api/";
      let params: any = { limit: 1 };
      
      if (lat && lon) {
        url = "https://photon.komoot.io/reverse";
        params = { lat, lon, limit: 1 };
      } else {
        params.q = q;
      }
      
      const response = await axios.get(url, { params });
      res.json(response.data);
    } catch (error: any) {
      console.error("[PROXY] Geo Error:", error.message);
      res.json({ features: [] });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
