import WebSocket from 'ws';

// 연결 ↔ 검증된 세션 매핑. 실시간 기능이 userId 로 특정 연결을 찾기 위한 공통 레지스트리.
// bind 는 검증된 세션에서만 호출된다 → getUserId 가 반환하는 userId 는 항상 인증됨.

export interface AuthedSession {
    userId: string;
    sessionTokenHash: string;
}

const byUser = new Map<string, WebSocket>();
const bySocket = new Map<WebSocket, AuthedSession>();

/**
 * 인증 성공 시 연결을 세션에 바인딩한다.
 * 같은 userId 의 이전 연결이 있으면 닫는다(중복 로그인 방지).
 * 같은 소켓이 다른 userId 로 재바인딩되면 이전 매핑을 정리한다.
 */
export function bind(session: AuthedSession, ws: WebSocket): void {
    const { userId } = session;

    const prev = bySocket.get(ws);
    if (prev && prev.userId !== userId && byUser.get(prev.userId) === ws) {
        byUser.delete(prev.userId);
    }

    const prevSocket = byUser.get(userId);
    byUser.set(userId, ws);
    bySocket.set(ws, session);
    if (prevSocket && prevSocket !== ws && prevSocket.readyState === WebSocket.OPEN) {
        try {
            prevSocket.close(4000, 'replaced by new connection');
        } catch {
            /* noop */
        }
    }
}

/** 연결 종료/로그아웃 시 호출. 해제된 userId 를 반환(바인딩이 없었으면 undefined). */
export function unbind(ws: WebSocket): string | undefined {
    const session = bySocket.get(ws);
    bySocket.delete(ws);
    const userId = session?.userId;
    if (userId !== undefined && byUser.get(userId) === ws) {
        byUser.delete(userId);
    }
    return userId;
}

export function getUserId(ws: WebSocket): string | undefined {
    return bySocket.get(ws)?.userId;
}

export function getSession(ws: WebSocket): AuthedSession | undefined {
    return bySocket.get(ws);
}

export function getSocket(userId: string): WebSocket | undefined {
    return byUser.get(userId);
}

/** 관리자 조회용 — 현재 바인딩된 연결 수. */
export function onlineCount(): number {
    return byUser.size;
}

/** 관리자 조회용 — 로그인된 userId 목록. */
export function onlineUserIds(): string[] {
    return [...byUser.keys()];
}

/** 특정 유저에게 이벤트를 보낸다. 연결이 없거나 열려있지 않으면 false. */
export function sendTo(userId: string, event: string, data: unknown): boolean {
    const ws = byUser.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
        return true;
    }
    return false;
}
