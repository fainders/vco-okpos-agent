import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { logger } from "./logger";
import { ERP_URL } from "./configInfo";

const instance = axios.create({
  baseURL: ERP_URL,
  timeout: 10000,
});

instance.interceptors.request.use((config) => {
  logger.debug(
    `[Axios] Sending request: ${config.method?.toUpperCase()} ${config.url}`,
    config
  );
  return config;
});

instance.interceptors.response.use(
  (response) => {
    logger.debug(
      `[Axios] Received response: ${response.status} ${response.config.url}`,
      response.data
    );
    return response;
  },
  (error) => {
    logger.error(
      `[Axios] Error: ${error.message} - ${error.response?.status} - ${error.response?.data}`
    );
    return Promise.reject(error);
  }
);

// export const axiosInstance = instance;
export const requestWithRetry = async <T>(
  config: AxiosRequestConfig,
  maxRetries = 3,
  retryDelayMs = 1000
): Promise<AxiosResponse<T>> => {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await instance.request<T>(config);
      return response;
    } catch (error: any) {
      const axiosError = error as AxiosError;

      const status = axiosError.response?.status;

      const isRetryable =
        axiosError.code === "ECONNABORTED" || // timeout
        axiosError.code === "ENOTFOUND" || // DNS
        (status && status >= 500 && status < 600); // 5xx

      attempt++;

      if (!isRetryable || attempt > maxRetries) {
        logger.error(`[Axios] Retry failed after ${attempt} attempts`);
        throw error;
      }

      logger.warn(
        `[Axios] Retry #${attempt} for ${config.method?.toUpperCase()} ${
          config.url
        } due to error: ${axiosError.message}`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * attempt)
      );
    }
  }

  throw new Error("Unreachable retry loop");
};
