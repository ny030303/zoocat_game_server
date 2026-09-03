import WebSocket from 'ws';
import { AuthService } from '../services/authService';
import { SessionService } from '../services/sessionService';
import { bind, getSession, getUserId, unbind } from './connectionRegistry';
import { cleanupUserState } from './cleanupUserState';
import { asObject, isSecretFormat, isStr, isTokenFormat, isUuid } from './validate';

function send(ws: WebSocket, event: string, data: unknown): void {
    ws.send(JSON.stringify({ event, data }));
}

type Ip = string | undefined;

/** 최초 진입 — 서버가 userId + deviceSecret + 세션 토큰 발급. */
export async function handleRegister(ws: WebSocket, payload: unknown, ip: Ip): Promise<void> {
    if (getUserId(ws)) return send(ws, 'error', '이미 로그인되어 있습니다');
    const p = asObject(payload);
    if (!isStr(p.userName, 1, 32)) return send(ws, 'registerError', '잘못된 요청입니다');
    const underage = p.underage === true || p.underage === 'true';
    try {
        const r = await AuthService.register(p.userName, underage, ip);
        bind({ userId: r.userId, sessionTokenHash: r.tokenHash }, ws);
        send(ws, 'registered', {
            userId: r.userId,
            deviceId: r.deviceId,
            deviceSecret: r.deviceSecret,
            token: r.token,
            userProfile: r.userProfile,
        });
    } catch {
        send(ws, 'registerError', '가입에 실패했습니다');
    }
}

/** 게스트 로그인. */
export async function handleLogin(ws: WebSocket, payload: unknown, ip: Ip): Promise<void> {
    if (getUserId(ws)) return send(ws, 'error', '이미 로그인되어 있습니다');
    const p = asObject(payload);
    if (!isUuid(p.userId) || !isUuid(p.deviceId) || !isSecretFormat(p.deviceSecret)) {
        return send(ws, 'loginError', '잘못된 요청입니다');
    }
    try {
        const r = await AuthService.loginGuest(p.userId, p.deviceId, p.deviceSecret, ip);
        if (!r) return send(ws, 'loginError', '자격 증명이 올바르지 않습니다');
        bind({ userId: r.userId, sessionTokenHash: r.tokenHash }, ws);
        send(ws, 'loginSuccess', { token: r.token, userProfile: r.userProfile });
    } catch {
        send(ws, 'loginError', '자격 증명이 올바르지 않습니다');
    }
}

/** 세션 토큰으로 복원. */
export async function handleResumeSession(ws: WebSocket, payload: unknown): Promise<void> {
    if (getUserId(ws)) return send(ws, 'error', '이미 로그인되어 있습니다');
    const p = asObject(payload);
    if (!isTokenFormat(p.token)) return send(ws, 'sessionExpired', null);
    try {
        const r = await AuthService.resume(p.token);
        if (!r) return send(ws, 'sessionExpired', null);
        bind({ userId: r.userId, sessionTokenHash: r.tokenHash }, ws);
        send(ws, 'loginSuccess', { userProfile: r.userProfile });
    } catch {
        send(ws, 'sessionExpired', null);
    }
}

/** 로그아웃 — 세션 폐기 + 큐/매치 정리 + unbind. 연결은 유지. */
export async function handleLogout(ws: WebSocket): Promise<void> {
    const userId = getUserId(ws);
    const session = getSession(ws);
    if (session) {
        try {
            await SessionService.revoke(session.sessionTokenHash);
        } catch {
            /* noop */
        }
    }
    cleanupUserState(userId);
    unbind(ws);
    send(ws, 'loggedOut', null);
}
