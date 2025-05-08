import { app, dialog, Menu, nativeImage, Tray } from "electron";
import { ChildProcess, fork, Serializable, spawn } from "child_process";
import path from "path";
import { logger } from "./src/logger";
import config from "./config";
import dotenv from "dotenv";
import { API_KEY, checkConfig } from "./src/configInfo";
import { setupServer } from "./src/server";
import { InterProcessMessage } from "./src/dllProcess/ipcInterface";
import { requestWithRetry } from "./src/axiosInstance";
dotenv.config();
const isPrd = app.isPackaged === true;

let dllProcess: ChildProcess | null = null;
let shouldRestartDllProcess = true;
let isDialogOpen = false;

try {
  checkConfig();
} catch (error) {
  logger.error("[Electron] Error in checkConfig:", error.message);
  isDialogOpen = true;
  if (isPrd) {
    dialog
      .showMessageBox({
        type: "error",
        title: "Configuration Error",
        message: `Error in checkConfig: ${error.message}`,
        buttons: ["OK"],
      })
      .then(() => {
        app.quit();
      });
  }
}

function startDllProcess() {
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
  dllProcess = spawn("node", [processPath], {
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
    if (response?.type !== "callback") {
      logger.warn("[Electron] Invalid message type:", response.type);
      return;
    }
    requestWithRetry(
      {
        url: "okpos/callback",
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
        },
        data: response.data,
      },
      3,
      1000
    ).catch((error) => {
      logger.error(
        "[Electron] Error sending callback to backend:",
        error.message
      );
    });
  });
  dllProcess.on("exit", (code) => {
    logger.warn(`[Electron] DLL process exited with code ${code}`);
    if (!isDialogOpen) {
      isDialogOpen = true;
      dialog
        .showMessageBox({
          type: "warning",
          title: "DLL Crash",
          message: `DLL process exited with code ${code}`,
          buttons: ["OK"],
        })
        .then(() => {
          isDialogOpen = false;
        });
    }
    dllProcess = null;
    if (shouldRestartDllProcess) {
      setTimeout(() => {
        logger.info("[Electron] Restarting DLL process...");
        startDllProcess();
      }, 3000);
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
    const tray = new Tray(trayIcon);
    tray.setToolTip("FAI VCO OKPOS Agent is running");
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
  setupServer();
  startDllProcess();
});

app.on("before-quit", () => {
  logger.info("[Electron] App is quitting. Stopping DLL process...");
  stopDllProcess();
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, exiting...");
  stopDllProcess();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, exiting...");
  stopDllProcess();
  process.exit(0);
});

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
    }, 5000);

    try {
      dllProcess.send(messageWithId);
    } catch (err) {
      dllProcess.off("message", handler);
      clearTimeout(timeout);
      return reject(new Error("DLL process send failed"));
    }
  });
};
