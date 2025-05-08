import { sendMessageToParent } from "./ipcInterface";
import { requestPos } from "./okpos-ffi";

export const requestToPos = (payload: object) => {
  const request = JSON.stringify(payload);
  const bufferSize = 1024 * 1024;
  const responseBuffer = Buffer.allocUnsafe(bufferSize);
  const result = requestPos(request, responseBuffer, bufferSize);
  try {
    const rawBuffer = responseBuffer.subarray(0, result);

    const decoder = new TextDecoder("euc-kr"); // Node 20 이상에서 지원됨
    const decoded = decoder.decode(rawBuffer);
    const parsed = JSON.parse(decoded);
    return parsed;
  } catch (error) {
    sendMessageToParent({
      type: "log-error",
      data: ["Error parsing response from DLL:", error.message],
    });
    throw new Error("Failed to parse response from DLL");
  }
};
