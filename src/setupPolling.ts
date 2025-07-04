import { isAxiosError } from "axios";
import { requestWithRetry } from "./axiosInstance";
import { API_KEY } from "./configInfo";
import { logger } from "./logger";

interface PendingCommand {
  id: string;
  payload: string;
}

const getPendingCommands = async () => {
  return requestWithRetry<{
    pendingCommand: PendingCommand[];
  }>({
    url: "pos/pending-commands",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
  }).then((response) => {
    return response.data.pendingCommand || [];
  });
};
const ackCommand = async (id: string, result: any) => {
  return requestWithRetry({
    url: `pos/pending-commands/${id}/ack`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    data: result,
  });
};

export const setUpPollingPendingCommands = (
  sendToDll: (data: any) => Promise<any>
) => {
  const pollingInterval = 5000; // 5초마다 폴링
  const ackInterval = 1000; // ACK 주기 (1초)
  let pollingTimer: NodeJS.Timeout | null = null;
  let processingTimer: NodeJS.Timeout | null = null;
  let isProcessing = false;
  let queue: PendingCommand[] = [];

  const putPendingCommand = (commands: PendingCommand[]) => {
    queue.push(...commands); // 큐에 명령어 추가
  };

  const getTopPendingCommand = () => {
    if (queue.length === 0) return null; // 큐가 비어있으면 null 반환
    return queue.shift(); // 큐에서 가장 앞의 명령어를 제거하고 반환
  };

  const processPendingCommands = async () => {
    if (isProcessing) return; // 이미 처리 중이면 중복 실행 방지
    const command = getTopPendingCommand();
    if (!command) return;
    isProcessing = true;
    try {
      const payload = JSON.parse(command.payload); // payload를 JSON으로 파싱
      const result = await sendToDll(payload);
      try {
        await ackCommand(command.id, {
          success: true,
          data: result,
        }); // 명령어 처리 후 ACK
      } catch (ackError) {
        logger.error("Error acknowledging command:", command.id, ackError);
      }
    } catch (error) {
      logger.error("Error sending to DLL:", error);
      let errorPayload;
      try {
        errorPayload = JSON.parse(error.message || "{}");
      } catch (parseError) {
        logger.error("Error parsing error message:", parseError);
        errorPayload = {
          message: error.message,
        };
      }
      logger.error("Error payload:", errorPayload);
      await ackCommand(command.id, {
        success: false,
        error: errorPayload,
      }); // 오류 발생 시 ACK
    } finally {
      isProcessing = false; // 처리 완료 후 상태 초기화
      processPendingCommands(); // 다음 명령어 처리
    }
  };

  const start = () => {
    if (!pollingTimer) {
      pollingTimer = setInterval(() => {
        getPendingCommands()
          .then((commands) => {
            if (commands.length > 0) {
              putPendingCommand(commands); // 새로운 명령어를 큐에 추가
            }
          })
          .catch((error) => {
            console.error("Error fetching pending commands:", error);
          });
      }, pollingInterval);
    }
    if (!processingTimer) {
      processingTimer = setInterval(() => {
        processPendingCommands();
      }, ackInterval);
    }
  };

  const stop = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    if (processingTimer) {
      clearInterval(processingTimer);
      processingTimer = null;
    }
  };

  start(); // 초기 시작

  return stop; // 반환된 함수로 폴링 중지 가능
};
