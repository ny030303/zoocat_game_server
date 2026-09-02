import WebSocket from 'ws';

// 연결당 슬라이딩 윈도우 레이트리밋. WINDOW_MS 안에 MAX_MSGS 초과 시 차단.
const WINDOW_MS = 10_000;
const MAX_MSGS = 100;

const hits = new Map<WebSocket, number[]>();

/** 이번 메시지를 허용하면 true, 레이트 초과면 false. */
export function allow(ws: WebSocket): boolean {
    const now = Date.now();
    const recent = (hits.get(ws) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    hits.set(ws, recent);
    return recent.length <= MAX_MSGS;
}

export function clear(ws: WebSocket): void {
    hits.delete(ws);
}
