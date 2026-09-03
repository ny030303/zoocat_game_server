import WebSocket, { WebSocketServer } from 'ws';
import { handleRegister, handleLogin, handleResumeSession, handleLogout } from './authHandlers';
import { handleUpdateDeck } from './deckHandlers';
import { handleJoinLobby, handleLeaveLobby } from './lobbyHandlers';
import { handleSendMessage } from './messageHandlers';
import { handleEnqueue, handleDequeue, handleMatchMessage, handleLeaveMatch } from './matchHandlers';
import { allowAuth } from './rateLimiter';

const AUTH_EVENTS = new Set(['register', 'login', 'resumeSession']);

export async function setupEventHandlers(
    ws: WebSocket,
    data: string,
    wss: WebSocketServer,
    ip: string | undefined,
) {
    let event: string;
    let payload: unknown;
    try {
        ({ event, data: payload } = JSON.parse(data));
    } catch {
        // 프레임 원문/에러 메시지는 로깅하지 않는다 (자격증명 조각 노출 방지)
        console.warn('malformed frame');
        ws.send(JSON.stringify({ event: 'error', data: '잘못된 메시지 형식입니다' }));
        return;
    }

    if (AUTH_EVENTS.has(event) && !allowAuth(ip, ws, event)) {
        ws.send(JSON.stringify({ event: 'error', data: '요청이 너무 많습니다' }));
        return;
    }

    try {
        switch (event) {
            case 'register':
                await handleRegister(ws, payload, ip);
                break;
            case 'login':
                await handleLogin(ws, payload, ip);
                break;
            case 'resumeSession':
                await handleResumeSession(ws, payload);
                break;
            case 'logout':
                await handleLogout(ws);
                break;

            case 'joinLobby':
                await handleJoinLobby(ws);
                break;
            case 'leaveLobby':
                handleLeaveLobby(ws, typeof payload === 'string' ? payload : '');
                break;
            case 'sendMessage':
                handleSendMessage(ws, payload, wss);
                break;
            case 'updateDeck':
                await handleUpdateDeck(ws, payload);
                break;

            case 'enqueue':
                await handleEnqueue(ws);
                break;
            case 'dequeue':
                handleDequeue(ws);
                break;
            case 'matchMessage':
                handleMatchMessage(ws, payload);
                break;
            case 'leaveMatch':
                handleLeaveMatch(ws);
                break;

            default:
                // 알 수 없는 이벤트 — 무응답
                break;
        }
    } catch (err) {
        console.error('event handler error:', event, err);
        ws.send(JSON.stringify({ event: 'error', data: '요청 처리 중 오류가 발생했습니다' }));
    }
}
