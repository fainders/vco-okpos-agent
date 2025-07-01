import {
  checkConnect,
  okposCallbackProto,
  registServerCallback,
  unRegistServerCallback,
} from "./okpos-ffi";
import { requestToPos } from "./okpos-api";
import koffi from "koffi";
import { InterProcessMessage, sendMessageToParent } from "./ipcInterface";

const SUCCESS_RESPONSE = 1;
const EXTERNAL_CODE = process.env.EXTERNAL_CODE;

const sleep = async (sleepMs: number) => {
  return await new Promise<void>((resolve) =>
    setTimeout(() => resolve(), sleepMs)
  );
};

// TODO pipe response to bridgeApi
const responseCallback = koffi.register((lenData: number, data: string) => {
  try {
    if (process.send) {
      sendMessageToParent({
        type: "callback",
        data,
      });
    }
    sendMessageToParent({
      type: "log-debug",
      data: ["callbackFunction called with data: ", data],
    });
  } catch (error) {
    sendMessageToParent({
      type: "log-error",
      data: ["callbackFunction error: ", error],
    });
  }
}, koffi.pointer(okposCallbackProto));

const registerCallbackWithRetry = () => {
  const response = registServerCallback(EXTERNAL_CODE, responseCallback);
  if (response !== SUCCESS_RESPONSE) {
    sendMessageToParent({
      type: "log-error",
      data: [
        "registServerCallback failed: ",
        response,
        EXTERNAL_CODE,
        responseCallback,
      ],
    });
    setTimeout(() => {
      sendMessageToParent({
        type: "log-info",
        data: ["Retrying to register callback..."],
      });
      registerCallbackWithRetry();
    }, 30000);
  } else {
    sendMessageToParent({
      type: "log-info",
      data: ["registServerCallback success"],
    });
  }
};

export const backgroundProcess = async () => {
  sendMessageToParent({
    type: "log-debug",
    data: ["backgroundProcess started"],
  });
  let response = checkConnect();
  if (response !== SUCCESS_RESPONSE) {
    sendMessageToParent({
      type: "log-error",
      data: ["checkConnect failed: ", response],
    });
    return process.exit(-1);
  }
  sendMessageToParent({
    type: "log-info",
    data: ["checkConnect success: ", response],
  });
  registerCallbackWithRetry();

  let done = false;

  process.on("message", (message: InterProcessMessage) => {
    if (!message) return;
    sendMessageToParent({
      type: "log-debug",
      data: ["received from parent process: ", message],
    });

    if (message.type === "exit") {
      done = true;
      return;
    }
    if (message.type === "msg-request") {
      if (!message.data) {
        sendMessageToParent({
          type: "log-error",
          data: ["message data is empty"],
        });
        return;
      }
      try {
        const response = requestToPos(message.data);
        if (response && response?.RESULT_CODE === "0000") {
          sendMessageToParent({
            type: "log-info",
            data: ["requestToPos success: ", response],
          });
          sendMessageToParent({
            type: "msg-response",
            data: response,
            id: message.id,
          });
        } else {
          const stringfiedError = JSON.stringify(response);
          sendMessageToParent({
            type: "log-error",
            data: ["requestToPos failed: ", stringfiedError],
          });
          sendMessageToParent({
            type: "msg-error",
            data: stringfiedError,
            id: message.id,
          });
        }
      } catch (error) {
        sendMessageToParent({
          type: "log-error",
          data: ["error in requestToPos: ", error],
        });
        if (error instanceof Error) {
          sendMessageToParent({
            type: "msg-error",
            data: error.message,
            id: message.id,
          });
        }
      }
    }
  });

  while (!done) {
    await sleep(1000);
  }

  response = unRegistServerCallback();
  if (response !== SUCCESS_RESPONSE) {
    sendMessageToParent({
      type: "log-error",
      data: ["unRegistServerCallback failed: ", response],
    });
    return process.exit(-1);
  }
};

backgroundProcess();

setInterval(() => {
  try {
    sendMessageToParent({
      type: "log-debug",
      data: ["pinging DLL process..."],
    });
    const result = checkConnect();
    sendMessageToParent({
      type: "log-debug",
      data: ["ping result: ", result],
    });
    if (result !== SUCCESS_RESPONSE) {
      sendMessageToParent({
        type: "log-error",
        data: ["ping failed, exiting subprocess..."],
      });
      process.exit(-1);
    } else {
      sendMessageToParent({
        type: "ping",
      });
    }
  } catch (error) {
    sendMessageToParent({
      type: "log-error",
      data: ["error pinging DLL: ", error],
    });
  }
}, 10000);
