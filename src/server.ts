import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { logger } from "./logger";
import { messageToDll } from "../main";

export function setupServer() {
  const server = express();
  const port = 4010;
  server.use(bodyParser.json());

  // Receive a request from backend to send message to DLL
  server.post("/send-to-dll", async (req: Request, res: Response) => {
    const message = req.body;
    logger.debug("[Server] Received message from backend:", message);
    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }
    try {
      const response = await messageToDll(message);
      logger.debug("[Server] Response from DLL:", response);
      res.json(response);
    } catch (error) {
      logger.error("[Server] Error processing request:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Optional: Receive callback from DLL
  // You can set up another /callback endpoint if needed, or use websockets to notify backend in future

  server.listen(port, () => {
    logger.info(`[Server] HTTP server running at http://localhost:${port}`);
  });
}
