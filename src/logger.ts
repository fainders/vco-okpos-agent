import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

const APP_DIR = process.env.PORTABLE_EXECUTABLE_DIR || process.cwd();
const logDir = path.join(APP_DIR, "logs");

const transport = new winston.transports.DailyRotateFile({
  filename: `${logDir}/%DATE%.log`,
  datePattern: "YYYY-MM-DD",
  zippedArchive: false,
  maxSize: "5m",
  maxFiles: "7d",
});

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const splat = meta[Symbol.for("splat")];
      let metaString = "";

      if (splat && Array.isArray(splat) && splat.length) {
        metaString =
          " " +
          splat
            .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
            .join(" ");
      } else if (Object.keys(meta).length) {
        metaString = " " + JSON.stringify(meta);
      }
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // 콘솔도 같이 출력
    transport,
  ],
});
