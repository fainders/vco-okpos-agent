import { sendMessageToParent } from "./ipcInterface";
import { requestPos } from "./okpos-ffi";

export const requestToPos = (payload: string) => {
  const eucKrBuffer = Buffer.from(payload, "latin1"); // latin1로 인코딩된 문자열을 다시 복구하여 EUC-KR로 변환
  const nullTerminatedInput = Buffer.concat([eucKrBuffer, Buffer.from([0])]); // EUC-KR 문자열 끝에 null 문자 추가하여 dll이 읽을 수 있도록 함

  const request = nullTerminatedInput;
  sendMessageToParent({
    type: "log-info",
    data: ["Sending request to DLL:", request],
  });
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
