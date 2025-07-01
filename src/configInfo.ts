import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { logger } from "./logger";
import config from "../config";

// Load .env
dotenv.config();

// Config values
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_DIR =
  process.env.PORTABLE_EXECUTABLE_DIR || path.join(__dirname, "..", "..");
const ERP_URL = config.ERP_URL;
const EXTERNAL_CODE = config.EXTERNAL_CODE;
const configPath = path.join(APP_DIR, "config.txt");
let API_KEY: string;
if (fs.existsSync(configPath)) {
  API_KEY = fs.readFileSync(configPath, "utf-8").replace(/\r?\n|\r/g, "");
}

export function checkConfig(): void {
  logger.info(
    `Running in ${
      IS_PRODUCTION ? "production" : "development"
    } mode - NODE_ENV:`,
    process.env.NODE_ENV
  );
  if (!ERP_URL) {
    throw new Error("ERP_URL is not defined in environment variables");
  }
  if (!EXTERNAL_CODE) {
    throw new Error("EXTERNAL_CODE is not defined in environment variables");
  }

  if (!fs.existsSync(APP_DIR)) {
    logger.error("APP_DIR does not exist:", APP_DIR);
    throw new Error(`APP_DIR does not exist: ${APP_DIR}`);
  }
  if (!fs.existsSync(configPath)) {
    logger.error("config.txt does not exist:", configPath);
    throw new Error(`config.txt does not exist: ${configPath}`);
  }
  if (!API_KEY) {
    logger.error("API_KEY is not defined in config.txt");
    throw new Error("API_KEY is not defined in config.txt");
  }
}
export { APP_DIR, ERP_URL, EXTERNAL_CODE, API_KEY, IS_PRODUCTION };
