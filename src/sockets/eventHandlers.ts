import WebSocket, { WebSocketServer } from 'ws';
import { getUserUnitsDTO } from '../models/unitModel';
import { UserCredentials, UserRegistration } from '../models/userModel';
import { handleSignup, handleLogin } from './authHandlers';
import { handleUpdateDeck } from './deckHandlers';
import { handleJoinLobby, handleLeaveLobby } from './lobbyHandlers';
import { handleSendMessage } from './messageHandlers';
import { handleEnqueue, handleDequeue, handleMatchMessage, handleLeaveMatch } from './matchHandlers';

export async function setupEventHandlers(ws: WebSocket, data: string, wss: WebSocketServer) {
    try {
        const { event, data: payload } = JSON.parse(data);

        switch (event) {
            case 'signup':
                await handleSignup(ws, payload as UserRegistration);
                break;

            case 'login':
                await handleLogin(ws, payload as UserCredentials);
                break;

            case 'joinLobby':
                handleJoinLobby(ws, payload as getUserUnitsDTO);
                break;

            case 'leaveLobby':
                handleLeaveLobby(ws, payload as string);
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
                console.log('알 수 없는 이벤트:', event);
        }
    } catch (error) {
        console.log(`🚪 ${error}`);
        ws.send(JSON.stringify({ event: 'error', data: '잘못된 메시지 형식입니다' }));
    }
}
