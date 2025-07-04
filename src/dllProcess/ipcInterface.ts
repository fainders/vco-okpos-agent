export type InterProcessMessage =
  | {
      type: "callback";
      data: string;
    }
  | {
      type: "msg-request";
      data: string;
      id: string;
    }
  | {
      type: "msg-response";
      data: object;
      id: string;
    }
  | {
      type: "msg-error";
      data: string;
      id: string;
    }
  | {
      type: "exit";
    }
  | {
      type: "log-error" | "log-info" | "log-debug";
      data: (string | object)[];
    }
  | {
      type: "ping";
    };

export const sendMessageToParent = (message: InterProcessMessage) => {
  if (process.send) {
    process.send(message);
  }
};
