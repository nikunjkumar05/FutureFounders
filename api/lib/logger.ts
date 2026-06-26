type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  ts: string;
  level: LogLevel;
  comp: string;
  msg: string;
  data?: Record<string, unknown>;
}

function emit(level: LogLevel, comp: string, msg: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    comp,
    msg,
    ...(data ? { data } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (comp: string, msg: string, data?: Record<string, unknown>) =>
    emit("DEBUG", comp, msg, data),
  info: (comp: string, msg: string, data?: Record<string, unknown>) =>
    emit("INFO", comp, msg, data),
  warn: (comp: string, msg: string, data?: Record<string, unknown>) =>
    emit("WARN", comp, msg, data),
  error: (comp: string, msg: string, data?: Record<string, unknown>) =>
    emit("ERROR", comp, msg, data),
};
