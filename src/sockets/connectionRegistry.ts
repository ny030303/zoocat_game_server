import WebSocket from 'ws';

// 연결 ↔ 유저 신원 매핑. 실시간 기능(매칭 등)이 userId 로 특정 연결을 찾기 위한 공통 레지스트리.
const byUser = new Map<string, WebSocket>();
const bySocket = new Map<WebSocket, string>();

/**
 * login 성공 시 연결을 userId 에 바인딩한다.
 * 같은 userId 로 이미 연결이 있으면 이전 연결을 닫는다(중복 로그인 방지).
 * 이전 연결의 'close' 이벤트가 뒤이어 발생해 매칭/큐 정리는 그쪽에서 처리된다.
 */
export function bind(userId: string, ws: WebSocket): void {
    // 이 소켓이 다른 userId 로 바인딩돼 있었으면(계정 전환 등) 그 매핑을 정리한다.
    const prevUserId = bySocket.get(ws);
    if (prevUserId !== undefined && prevUserId !== userId && byUser.get(prevUserId) === ws) {
        byUser.delete(prevUserId);
    }

    const prevSocket = byUser.get(userId);
    byUser.set(userId, ws);
    bySocket.set(ws, userId);
    if (prevSocket && prevSocket !== ws && prevSocket.readyState === WebSocket.OPEN) {
        try {
            prevSocket.close(4000, 'replaced by new connection');
        } catch {
            /* noop */
        }
    }
}

/** 연결 종료 시 호출. 해제된 userId 를 반환한다(바인딩이 없었으면 undefined). */
export function unbind(ws: WebSocket): string | undefined {
    const userId = bySocket.get(ws);
    bySocket.delete(ws);
    // 재로그인으로 byUser 가 이미 새 소켓을 가리키면 그대로 둔다.
    if (userId !== undefined && byUser.get(userId) === ws) {
        byUser.delete(userId);
    }
    return userId;
}

export function getUserId(ws: WebSocket): string | undefined {
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
