import { requestWithRetry } from "./axiosInstance";
import { getApiKey } from "./configInfo";
import { logger } from "./logger";

export const requestOkposInit = async () => {
  logger.info("[OKPOS INIT] Initializing OKPOS...");
  return requestWithRetry<void>({
    url: "pos/okpos/init",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
  })
    .then(() => {
      logger.info("[OKPOS INIT] OKPOS initialization completed.");
    })
    .catch((error) => {
      logger.error("[OKPOS INIT] OKPOS initialization failed");
      logger.error(error.message);
    });
};
