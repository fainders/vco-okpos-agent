import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerSaveBlocker, screen, Tray } from 'electron';
import { ChildProcess, fork, Serializable, spawn } from 'child_process';
import path from 'path';
import { logger } from './src/logger';
import config from './config';
import dotenv from 'dotenv';
import iconv from 'iconv-lite';
import { API_KEY, checkConfig } from './src/configInfo';
import { InterProcessMessage } from './src/dllProcess/ipcInterface';
import { requestWithRetry } from './src/axiosInstance';
import { setUpPollingPendingCommands } from './src/setupPolling';
import { requestOkposInit } from './src/requestOkposInit';
import { autoUpdater } from 'electron-updater';
dotenv.config();

function buildTrayMenu(updateReady: boolean) {
  const items: Electron.MenuItemConstructorOptions[] = [];
  if (updateReady) {
    items.push({ label: '업데이트 설치 후 재시작', click: () => autoUpdater.quitAndInstall() });
    items.push({ type: 'separator' });
  }
  items.push({ label: '종료', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

function setupAutoUpdater() {
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('[Updater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('[Updater] Update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('[Updater] Already up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    logger.info(`[Updater] Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('[Updater] Update downloaded:', info.version);
    tray?.setContextMenu(buildTrayMenu(true));
    tray?.setToolTip(`업데이트 준비 완료 (v${info.version}) — 트레이 메뉴에서 재시작`);
  });

  autoUpdater.on('error', (error) => {
    logger.error('[Updater] Error:', error.message);
  });
}
const isPrd = app.isPackaged === true;

let dllProcess: ChildProcess | null = null;
let shouldRestartDllProcess = true;

// polling을 위한 변수

let stopPolling: (() => void) | null = null;

let tray: Tray | null = null;
let overlayWindow: BrowserWindow | null = null;
let detailWindow: BrowserWindow | null = null;
let lastDllProcessCheckTime = 0;
let trayStatus: 'connected' | 'disconnected' = 'connected';

// DLL 프로세스가 응답하지 않는 경우의 타임아웃 시간 (ms)
const PING_TIMEOUT_MS = 15000;
// 절전모드에서 작동하도록 설정
const blockerId = powerSaveBlocker.start('prevent-app-suspension');

try {
  checkConfig();
} catch (error) {
  logger.error('[Electron] Error in checkConfig:', error.message);
  app.quit();
}

function startDllProcess() {
  const nodePath = isPrd ? path.join(process.resourcesPath, 'package', 'node.exe') : path.join(__dirname, 'package', 'node.exe'); // node.exe 경로 설정
  const processPath = isPrd ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'src', 'dllProcess', 'okpos-process.js') : path.join(__dirname, 'src', 'dllProcess', 'okpos-process.js');
  dllProcess = spawn(nodePath, [processPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: isPrd ? 'production' : 'development',
      ...config
    }
  });
  logger.info('[Electron] DLL process started');
  dllProcess.stdout?.on('data', (data) => {
    logger.info('[Electron] DLL process stdout:', data.toString());
  });
  dllProcess.stderr?.on('data', (data) => {
    logger.error('[Electron] DLL process stderr:', data.toString());
  });
  dllProcess.on('error', (error) => {
    logger.error('[Electron] DLL process error:', error);
  });
  dllProcess.on('message', (msg) => {
    const response = msg as InterProcessMessage;
    if (response.type === 'log-error') {
      logger.error('[DLL] ', ...response.data);
      return;
    }
    if (response.type === 'log-info') {
      logger.info('[DLL] ', ...response.data);
      return;
    }
    if (response.type === 'log-debug') {
      logger.debug('[DLL] ', ...response.data);
      return;
    }
    if (response.type === 'msg-response' || response.type === 'msg-error' || response.type === 'msg-request') {
      return; // messageToDll에서 처리
    }
    if (response.type === 'ping') {
      const currentTime = Date.now();
      lastDllProcessCheckTime = currentTime;
      return;
    }
    if (response.type === 'callback') {
      let parsed: Serializable;
      try {
        parsed = JSON.parse(response.data);
      } catch (error) {
        logger.error('[Electron] Error parsing callback data:', error.message);
        return;
      }
      requestWithRetry(
        {
          url: 'pos/okpos/callback',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
          },
          data: parsed
        },
        3,
        1000
      ).catch((error) => {
        logger.error('[Electron] Error sending callback to backend:', error.message);
      });
      return;
    }
    logger.warn('[Electron] Invalid message type:', response.type);
    return;
  });
  dllProcess.on('exit', (code) => {
    logger.warn(`[Electron] DLL process exited with code ${code}`);
    dllProcess = null;
    if (shouldRestartDllProcess) {
      setTimeout(() => {
        logger.info('[Electron] Restarting DLL process...');
        startDllProcess();
      }, 5000);
    } else {
      logger.info('[Electron] DLL process will not be restarted.');
    }
  });
}

function stopDllProcess() {
  shouldRestartDllProcess = false;
  if (dllProcess) {
    const exitMessage: InterProcessMessage = {
      type: 'exit'
    };
    dllProcess.send(exitMessage);
    logger.info('[Electron] Sent exit message to DLL process');
  }
}

function createOverlayWindow() {
  const overlayPath = isPrd ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'src', 'overlay', 'overlay.html') : path.join(__dirname, 'src', 'overlay', 'overlay.html');

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 60,
    x: 80,
    y: 10,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // CSS 컨텐츠 너비: 연결 180px, 비연결 380px (overlay.css 기준)
  const CONTENT_WIDTH_CONNECTED = 180;
  const CONTENT_WIDTH_DISCONNECTED = 380;

  // 커서 위치를 폴링하여 컨텐츠 영역 위에 있을 때만 마우스 이벤트 수신
  // (렌더러 이벤트 방식은 -webkit-app-region:drag 가 모든 마우스 이벤트를 차단하므로 사용 불가)
  let lastIgnoreState = true;
  setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = overlayWindow.getBounds();
    const contentWidth = trayStatus === 'connected' ? CONTENT_WIDTH_CONNECTED : CONTENT_WIDTH_DISCONNECTED;
    const isOverContent =
      cursor.x >= bounds.x &&
      cursor.x < bounds.x + contentWidth &&
      cursor.y >= bounds.y &&
      cursor.y < bounds.y + bounds.height;
    const shouldIgnore = !isOverContent;
    if (shouldIgnore !== lastIgnoreState) {
      overlayWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      lastIgnoreState = shouldIgnore;
    }
  }, 50);

  overlayWindow.loadFile(overlayPath);

  if (!isPrd) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

  overlayWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logger.info(`[Overlay Console] ${message} (Source: ${sourceId}, Line: ${line})`);
  });
  overlayWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logger.error(`[Overlay Load Fail] ${errorDescription} (URL: ${validatedURL}, Code: ${errorCode})`);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  logger.info('[Electron] Overlay window created');
}

function createDetailWindow() {
  if (detailWindow) {
    detailWindow.focus();
    return;
  }

  detailWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const detailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 20px;
          background: #f5f5f5;
          margin: 0;
        }
        h2 {
          color: #333;
          margin-top: 0;
          border-bottom: 2px solid #4caf50;
          padding-bottom: 10px;
        }
        .info-item {
          margin: 12px 0;
          padding: 10px;
          background: white;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .label {
          font-weight: 600;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .value {
          color: #333;
          font-size: 14px;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-connected {
          background: #e8f5e9;
          color: #2e7d32;
        }
        .status-disconnected {
          background: #ffebee;
          color: #c62828;
        }
      </style>
    </head>
    <body>
      <h2>VCO OKPOS Agent 상세 정보</h2>
      <div class="info-item">
        <div class="label">상태</div>
        <div class="value">
          <span id="status-badge" class="status-badge ${trayStatus === 'connected' ? 'status-connected' : 'status-disconnected'}">${trayStatus === 'connected' ? '정상 동작 중' : '연결 끊김'}</span>
        </div>
      </div>
      <div class="info-item">
        <div class="label">버전</div>
        <div class="value">v${app.getVersion()}</div>
      </div>
      <div class="info-item">
        <div class="label">환경</div>
        <div class="value">${config.ERP_URL}</div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('update-detail-status', (_, data) => {
          const badge = document.getElementById('status-badge');
          if (data.connected) {
            badge.textContent = '정상 동작 중';
            badge.className = 'status-badge status-connected';
          } else {
            badge.textContent = '연결 끊김';
            badge.className = 'status-badge status-disconnected';
          }
        });
      </script>
    </body>
    </html>
  `;

  detailWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(detailHtml)}`);

  detailWindow.on('closed', () => {
    detailWindow = null;
  });

  logger.info('[Electron] Detail window created');
}

function updateOverlayStatus(connected: boolean, message?: string) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const iconPath = isPrd
      ? path.join(process.resourcesPath, 'assets', connected ? 'app-icon.png' : 'app-icon-negative.png')
      : path.join(__dirname, 'assets', connected ? 'app-icon.png' : 'app-icon-negative.png'); // dev 모드 경로
    overlayWindow.webContents.send('update-status', {
      connected,
      message: message || (connected ? 'VCO 운영중' : 'VCO 운영 불가'),
      iconPath
    });
  }
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.webContents.send('update-detail-status', { connected });
  }
}

app.on('ready', () => {
  logger.info('[Electron] App is ready. Starting DLL process...');

  // 포터블 앱 시작프로그램 등록 (매 실행 시 경로 갱신)
  if (isPrd) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
    });
    logger.info('[Electron] Login item settings updated.');
  }
  try {
    const iconPath = isPrd ? path.join(process.resourcesPath, 'assets', 'app-icon.png') : path.join(__dirname, 'assets', 'app-icon.png'); // dev 모드 경로

    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    tray.setContextMenu(buildTrayMenu(false));
  } catch (error) {
    logger.error('[Electron] Error creating tray icon:', error.message);
  }

  // 자동 업데이트 설정 (prd 빌드에서만)
  if (isPrd) {
    setupAutoUpdater();
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      logger.error('[Updater] checkForUpdates failed:', error.message);
    });
  }

  // Overlay 윈도우 생성
  createOverlayWindow();

  // IPC 핸들러 등록
  ipcMain.on('show-detail-window', () => {
    createDetailWindow();
  });

  ipcMain.on('request-initial-status', () => {
    updateOverlayStatus(trayStatus === 'connected', trayStatus === 'connected' ? 'VCO 운영중' : 'VCO 운영 불가');
  });

  requestOkposInit();
  stopPolling = setUpPollingPendingCommands(messageToDll);
  startDllProcess();
});

app.on('before-quit', () => {
  logger.info('[Electron] App is quitting. Stopping DLL process...');
  powerSaveBlocker.stop(blockerId);
  stopDllProcess();
  stopPolling?.();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, exiting...');
  stopDllProcess();
  stopPolling?.();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, exiting...');
  stopDllProcess();
  stopPolling?.();
  process.exit(0);
});

setInterval(() => {
  const currentTime = Date.now();
  const delay = currentTime - lastDllProcessCheckTime;
  if (delay > PING_TIMEOUT_MS) {
    if (trayStatus === 'connected') {
      trayStatus = 'disconnected';
      const iconPath = isPrd ? path.join(process.resourcesPath, 'assets', 'app-icon-negative.png') : path.join(__dirname, 'assets', 'app-icon-negative.png'); // dev 모드 경로

      // const trayIcon = nativeImage.createFromPath(iconPath);
      // tray = new Tray(trayIcon);
      tray.setImage(iconPath);
      tray?.setToolTip('FAI VCO OKPOS Agent 연결 끊김');
      updateOverlayStatus(false, 'VCO 운영 불가');
    }
  } else {
    if (trayStatus === 'disconnected') {
      trayStatus = 'connected';
      const iconPath = isPrd ? path.join(process.resourcesPath, 'assets', 'app-icon.png') : path.join(__dirname, 'assets', 'app-icon.png'); // dev 모드 경로

      // const trayIcon = nativeImage.createFromPath(iconPath);
      // tray = new Tray(trayIcon);
      tray.setImage(iconPath);
      tray?.setToolTip('FAI VCO OKPOS Agent가 실행 중입니다.');
      updateOverlayStatus(true, 'VCO 운영중');
    }
  }
}, 5000);

export const messageToDll = (message: object): Promise<object> => {
  return new Promise((resolve, reject) => {
    if (!dllProcess || !dllProcess.connected) {
      const errorMsg = '[Electron] DLL process is not running';
      logger.error(errorMsg);
      return reject(new Error(errorMsg));
    }

    const requestId = Math.random().toString(36).substring(2, 15);
    const encoded = iconv.encode(JSON.stringify(message), 'euc-kr');

    const messageWithId: InterProcessMessage = {
      data: encoded.toString('latin1'), // ipc간 데이터 보존을 위해 latin1로 인코딩
      id: requestId,
      type: 'msg-request'
    };

    const handler = (msg: InterProcessMessage) => {
      if (msg.type !== 'msg-response' && msg.type !== 'msg-error') return;
      if (msg.id !== requestId) return;
      dllProcess?.off('message', handler);
      clearTimeout(timeout);
      if (msg.type === 'msg-error') {
        return reject(new Error(msg.data));
      }
      return resolve(msg.data);
    };

    dllProcess.on('message', handler);

    const timeout = setTimeout(() => {
      dllProcess?.off('message', handler);
      reject(new Error('Timeout: No response from DLL within 5 seconds'));
    }, 10000);

    try {
      dllProcess.send(messageWithId);
    } catch (err) {
      dllProcess?.off('message', handler);
      clearTimeout(timeout);
      return reject(new Error('DLL process send failed'));
    }
  });
};
