import { ipcRenderer } from "electron";

const overlayContainer = document.getElementById("overlay-container")!;
const agentIcon = document.getElementById("agent-icon") as HTMLImageElement;
const statusIndicator = document.getElementById("status-indicator")!;
const statusLabel = document.getElementById("status-label")!;
const closeBtn = document.getElementById("close-btn")!;

// 상태 업데이트 수신
ipcRenderer.on("update-status", (_event, data: { connected: boolean; message: string }) => {
  const { connected, message } = data;

  if (connected) {
    statusIndicator.classList.remove("disconnected");
    statusIndicator.classList.add("connected");
    overlayContainer.classList.remove("disconnected");
    statusLabel.textContent = message || "실행중";
    agentIcon.src = "../assets/app-icon.png";
  } else {
    statusIndicator.classList.remove("connected");
    statusIndicator.classList.add("disconnected");
    overlayContainer.classList.add("disconnected");
    statusLabel.textContent = message || "연결 끊김";
    agentIcon.src = "../assets/app-icon-negative.png";
  }
});

// 더블클릭 시 상세 정보 표시
overlayContainer.addEventListener("dblclick", () => {
  ipcRenderer.send("show-detail-window");
});

// 닫기 버튼
closeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  ipcRenderer.send("hide-overlay");
});

// 초기 상태 요청
ipcRenderer.send("request-initial-status");
