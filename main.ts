import {
  app,
  dialog,
  Menu,
  nativeImage,
  powerSaveBlocker,
  Tray,
} from "electron";
import { ChildProcess, fork, Serializable, spawn } from "child_process";
import path from "path";
import { logger } from "./src/logger";
import config from "./config";
import dotenv from "dotenv";
import { API_KEY, checkConfig } from "./src/configInfo";
import { InterProcessMessage } from "./src/dllProcess/ipcInterface";
import { requestWithRetry } from "./src/axiosInstance";
import { setUpPollingPendingCommands } from "./src/setupPolling";
dotenv.config();
const isPrd = app.isPackaged === true;

let dllProcess: ChildProcess | null = null;
let shouldRestartDllProcess = true;

// polling을 위한 변수

let stopPolling: (() => void) | null = null;

// ui 변수
let isDialogOpen = false;
let tray: Tray | null = null;
let lastDllProcessCheckTime = 0;
let trayStatus: "connected" | "disconnected" = "connected";

// DLL 프로세스가 응답하지 않는 경우의 타임아웃 시간 (ms)
const PING_TIMEOUT_MS = 15000;
// 절전모드에서 작동하도록 설정
const blockerId = powerSaveBlocker.start("prevent-app-suspension");

try {
  checkConfig();
} catch (error) {
  logger.error("[Electron] Error in checkConfig:", error.message);
  isDialogOpen = true;
  if (isPrd) {
    dialog
      .showMessageBox({
        type: "error",
        title: "설정 오류",
        message: `설정이 완료되지 않았습니다. ${error.message}`,
        buttons: ["OK"],
      })
      .then(() => {
        app.quit();
      });
  }
}

function startDllProcess() {
  const nodePath = isPrd
    ? path.join(process.resourcesPath, "package", "node.exe")
    : path.join(__dirname, "package", "node.exe"); // node.exe 경로 설정
  const processPath = isPrd
    ? path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "dist",
        "src",
        "dllProcess",
        "okpos-process.js"
      )
    : path.join(__dirname, "src", "dllProcess", "okpos-process.js");
  dllProcess = spawn(nodePath, [processPath], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      NODE_ENV: isPrd ? "production" : "development",
      ...config,
    },
  });
  logger.info("[Electron] DLL process started");
  dllProcess.stdout?.on("data", (data) => {
    logger.info("[Electron] DLL process stdout:", data.toString());
  });
  dllProcess.stderr?.on("data", (data) => {
    logger.error("[Electron] DLL process stderr:", data.toString());
  });
  dllProcess.on("error", (error) => {
    logger.error("[Electron] DLL process error:", error);
    if (!isDialogOpen) {
      isDialogOpen = true;
      dialog
        .showMessageBox({
          type: "error",
          title: "DLL Error",
          message: `DLL process error: ${error}`,
          buttons: ["OK"],
        })
        .then(() => {
          isDialogOpen = false;
        });
    }
  });
  dllProcess.on("message", (msg) => {
    const response = msg as InterProcessMessage;
    if (response.type === "log-error") {
      logger.error("[DLL] ", ...response.data);
      return;
    }
    if (response.type === "log-info") {
      logger.info("[DLL] ", ...response.data);
      return;
    }
    if (response.type === "log-debug") {
      logger.debug("[DLL] ", ...response.data);
      return;
    }
    if (
      response.type === "msg-response" ||
      response.type === "msg-error" ||
      response.type === "msg-request"
    ) {
      return; // messageToDll에서 처리
    }
    if (response.type === "ping") {
      const currentTime = Date.now();
      lastDllProcessCheckTime = currentTime;
      return;
    }
    if (response.type === "callback") {
      let parsed: Serializable;
      try {
        parsed = JSON.parse(response.data);
      } catch (error) {
        logger.error("[Electron] Error parsing callback data:", error.message);
        return;
      }
      requestWithRetry(
        {
          url: "pos/okpos/callback",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
          },
          data: parsed,
        },
        3,
        1000
      ).catch((error) => {
        logger.error(
          "[Electron] Error sending callback to backend:",
          error.message
        );
      });
      return;
    }
    logger.warn("[Electron] Invalid message type:", response.type);
    return;
  });
  dllProcess.on("exit", (code) => {
    logger.warn(`[Electron] DLL process exited with code ${code}`);
    if (!isDialogOpen) {
      if (code === 4294967295) {
        isDialogOpen = true;
        dialog
          .showMessageBox({
            type: "error",
            title: "DLL 크래시",
            message: `OKPOS이 연결되었는지 확인해 주세요.`,
            buttons: ["OK"],
          })
          .then(() => {
            isDialogOpen = false;
          });
        // } else {
        //   isDialogOpen = true;
        //   dialog
        //     .showMessageBox({
        //       type: "warning",
        //       title: "DLL Crash",
        //       message: `DLL process exited with code ${code}`,
        //       buttons: ["OK"],
        //     })
        //     .then(() => {
        //       isDialogOpen = false;
        //     });
      }
    }
    dllProcess = null;
    if (shouldRestartDllProcess) {
      setTimeout(() => {
        logger.info("[Electron] Restarting DLL process...");
        startDllProcess();
      }, 5000);
    } else {
      logger.info("[Electron] DLL process will not be restarted.");
    }
  });
}

function stopDllProcess() {
  shouldRestartDllProcess = false;
  if (dllProcess) {
    const exitMessage: InterProcessMessage = {
      type: "exit",
    };
    dllProcess.send(exitMessage);
    logger.info("[Electron] Sent exit message to DLL process");
  }
}

app.on("ready", () => {
  logger.info("[Electron] App is ready. Starting DLL process...");
  try {
    const iconPath = isPrd
      ? path.join(process.resourcesPath, "assets", "app-icon.png")
      : path.join(__dirname, "assets", "app-icon.png"); // dev 모드 경로

    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    tray.setContextMenu(
      Menu.buildFromTemplate([{ label: "종료", click: () => app.quit() }])
    );
  } catch (error) {
    logger.error("[Electron] Error creating tray icon:", error.message);
    dialog
      .showMessageBox({
        type: "warning",
        title: "Tray Icon Error",
        message: `Error creating tray icon: ${error.message}`,
        buttons: ["OK"],
      })
      .then(() => {
        isDialogOpen = false;
        app.quit();
      });
  }
  stopPolling = setUpPollingPendingCommands(messageToDll);
  startDllProcess();
});

app.on("before-quit", () => {
  logger.info("[Electron] App is quitting. Stopping DLL process...");
  powerSaveBlocker.stop(blockerId);
  stopDllProcess();
  stopPolling?.();
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, exiting...");
  stopDllProcess();
  stopPolling?.();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, exiting...");
  stopDllProcess();
  stopPolling?.();
  process.exit(0);
});

setInterval(() => {
  const currentTime = Date.now();
  const delay = currentTime - lastDllProcessCheckTime;
  if (delay > PING_TIMEOUT_MS) {
    if (trayStatus === "connected") {
      trayStatus = "disconnected";
      const iconPath = isPrd
        ? path.join(process.resourcesPath, "assets", "app-icon-negative.png")
        : path.join(__dirname, "assets", "app-icon-negative.png"); // dev 모드 경로

      // const trayIcon = nativeImage.createFromPath(iconPath);
      // tray = new Tray(trayIcon);
      tray.setImage(iconPath);
      tray?.setToolTip("FAI VCO OKPOS Agent 연결 끊김");
    }
  } else {
    if (trayStatus === "disconnected") {
      trayStatus = "connected";
      const iconPath = isPrd
        ? path.join(process.resourcesPath, "assets", "app-icon.png")
        : path.join(__dirname, "assets", "app-icon.png"); // dev 모드 경로

      // const trayIcon = nativeImage.createFromPath(iconPath);
      // tray = new Tray(trayIcon);
      tray.setImage(iconPath);
      tray?.setToolTip("FAI VCO OKPOS Agent가 실행 중입니다.");
    }
  }
}, 5000);

export const messageToDll = (message: object): Promise<object> => {
  return new Promise((resolve, reject) => {
    if (!dllProcess || !dllProcess.connected) {
      const errorMsg = "[Electron] DLL process is not running";
      logger.error(errorMsg);
      return reject(new Error(errorMsg));
    }

    const requestId = Math.random().toString(36).substring(2, 15);
    const messageWithId: InterProcessMessage = {
      data: message,
      id: requestId,
      type: "msg-request",
    };

    const handler = (msg: InterProcessMessage) => {
      if (msg.type !== "msg-response" && msg.type !== "msg-error") return;
      if (msg.id !== requestId) return;
      dllProcess.off("message", handler);
      clearTimeout(timeout);
      if (msg.type === "msg-error") {
        return reject(new Error(msg.data));
      }
      return resolve(msg.data);
    };

    dllProcess.on("message", handler);

    const timeout = setTimeout(() => {
      dllProcess.off("message", handler);
      reject(new Error("Timeout: No response from DLL within 5 seconds"));
    }, 10000);

    try {
      dllProcess.send(messageWithId);
    } catch (err) {
      dllProcess.off("message", handler);
      clearTimeout(timeout);
      return reject(new Error("DLL process send failed"));
    }
  });
};
