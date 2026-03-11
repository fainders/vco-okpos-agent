import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { app } from "electron";
import { logger } from "./logger";
import config from "../config";

// Load .env
dotenv.config();

// Config values
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_DIR = app.isPackaged ? app.getPath("userData") : path.join(__dirname, "..", "..");
const ERP_URL = config.ERP_URL;
const EXTERNAL_CODE = config.EXTERNAL_CODE;
export const configPath = path.join(APP_DIR, "config.txt");

let _apiKey = "";
if (fs.existsSync(configPath)) {
  _apiKey = fs.readFileSync(configPath, "utf-8").replace(/\r?\n|\r/g, "").trim();
}

/** 현재 API 키를 반환합니다 (항상 최신 메모리 값). */
export function getApiKey(): string {
  return _apiKey;
}

/** API 키가 설정되어 있는지 확인합니다. */
export function hasApiKey(): boolean {
  return _apiKey.length > 0;
}

/**
 * API 키를 업데이트하고 config.txt에 저장합니다.
 * 하위 호환성: 기존 긴 형식(a293fhr9w3fwerk)과 새 형식(ABC-123-456) 모두 허용합니다.
 */
export function setApiKey(key: string): void {
  _apiKey = key.trim();
  fs.writeFileSync(configPath, _apiKey, "utf-8");
  logger.info("[Config] API key updated.");
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
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
  // API_KEY 부재는 main.ts에서 키 설정 창으로 처리합니다.
  if (!hasApiKey()) {
    logger.warn("[Config] API key is not set. Key setup window will be shown.");
  }
}

export { APP_DIR, ERP_URL, EXTERNAL_CODE, IS_PRODUCTION };
