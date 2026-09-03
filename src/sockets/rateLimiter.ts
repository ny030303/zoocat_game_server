import WebSocket from 'ws';
import { env } from '../config/env';

// ── 일반 이벤트: 연결당 슬라이딩 윈도우 ──────────────────────
const WINDOW_MS = 10_000;
const MAX_MSGS = 100;
const hits = new Map<WebSocket, number[]>();

export function allow(ws: WebSocket): boolean {
    const now = Date.now();
    const recent = (hits.get(ws) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    hits.set(ws, recent);
    return recent.length <= MAX_MSGS;
}

// ── 인증 이벤트: IP 기준 저예산 ─────────────────────────────
interface AuthLimit {
    ipWindowMs: number;
    ipMax: number;
    wsWindowMs?: number;
    wsMax?: number;
}
const AUTH_LIMITS: Record<string, AuthLimit> = {
    register: { ipWindowMs: 3_600_000, ipMax: env.RATE_REGISTER_PER_HOUR },
    login: { ipWindowMs: 60_000, ipMax: env.RATE_LOGIN_PER_MIN, wsWindowMs: 60_000, wsMax: 5 },
    resumeSession: { ipWindowMs: 60_000, ipMax: env.RATE_RESUME_PER_MIN },
};

const ipHits = new Map<string, number[]>(); // key: `${ip}:${event}`
const loginWsHits = new Map<WebSocket, number[]>();

function bump(arr: number[] | undefined, windowMs: number): number[] {
    const now = Date.now();
    const recent = (arr ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    return recent;
}

export function allowAuth(ip: string | undefined, ws: WebSocket, event: string): boolean {
    const cfg = AUTH_LIMITS[event];
    if (!cfg) return true;

    const ipKey = `${ip ?? 'noip'}:${event}`;
    const ipArr = bump(ipHits.get(ipKey), cfg.ipWindowMs);
    ipHits.set(ipKey, ipArr);
    if (ipArr.length > cfg.ipMax) return false;

    if (cfg.wsMax != null && cfg.wsWindowMs != null) {
        const wsArr = bump(loginWsHits.get(ws), cfg.wsWindowMs);
        loginWsHits.set(ws, wsArr);
        if (wsArr.length > cfg.wsMax) return false;
    }
    return true;
}

export function clear(ws: WebSocket): void {
    hits.delete(ws);
    loginWsHits.delete(ws);
}
