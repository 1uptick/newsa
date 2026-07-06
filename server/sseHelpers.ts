import type { Response } from "express";

const SSE_KEEPALIVE_MS = 15_000;

export function writeSse(res: Response, data: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

function writeSseKeepalive(res: Response): void {
  if (res.writableEnded) return;
  res.write(": keepalive\n\n");
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

export function startSseResponse(res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const timer = setInterval(() => writeSseKeepalive(res), SSE_KEEPALIVE_MS);
  return () => clearInterval(timer);
}
