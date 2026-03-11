import koffi from 'koffi';
import path from 'path';
import { sendMessageToParent } from './ipcInterface';
const basePath = __dirname;

const dllPath = path.join(basePath, '..', 'dll', 'OKDC.dll');
sendMessageToParent({
  type: 'log-debug',
  data: ['OKPOS DLL path:', dllPath]
});
// let okpos: any = null;
let okpos: koffi.IKoffiLib | null = null;
try {
  okpos = koffi.load(dllPath);
} catch (error) {
  sendMessageToParent({
    type: 'log-error',
    data: ['Failed to load OKDC.dll:', error]
  });
  throw error;
}
if (!okpos) {
  sendMessageToParent({
    type: 'log-error',
    data: ['Failed to load OKDC.dll: okpos is null']
  });
  throw new Error('Failed to load OKDC.dll: okpos is null');
}

sendMessageToParent({
  type: 'log-debug',
  data: ['OKDC.dll loaded successfully']
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const okposCallbackProto = koffi.proto('void __stdcall callbackFunction ( int lenData, char* data )');

export const checkConnect = okpos.func('int __stdcall CheckConnect()');

export const requestPos = okpos.func('int __stdcall RequestPos(char *input_msg, char *output_msg, int max_output_msg_size)');

export const requestPosTimeout = okpos.func('int __stdcall RequestPosTimeOut(char *input_msg, char *output_msg, int max_output_msg_size, int timeout_sec)');

export const registServerCallback = okpos.func('int __stdcall RegistServerCallback(char* user_id, callbackFunction *lpCallbackFunc)');

export const unRegistServerCallback = okpos.func('int __stdcall UnRegistServerCallback()');
