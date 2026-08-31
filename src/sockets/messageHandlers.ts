import WebSocket, { WebSocketServer } from 'ws';
import { getUserId } from './connectionRegistry';

const MAX_MESSAGE_LEN = 500;

export function handleSendMessage(ws: WebSocket, payload: any, wss: WebSocketServer) {
    const userId = getUserId(ws);
    if (!userId) {
        return ws.send(JSON.stringify({ event: 'error', data: '로그인이 필요합니다' }));
    }

    const message = payload?.message;
    if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE_LEN) {
        return ws.send(JSON.stringify({ event: 'error', data: '메시지 형식이 올바르지 않습니다' }));
    }

    broadcastMessage(ws, userId, message, wss);
    console.log(`💬 ${userId}: ${message}`);
}

function broadcastMessage(ws: WebSocket, from: string, message: string, wss: WebSocketServer) {
    wss.clients.forEach((client: WebSocket) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'newMessage', data: { from, message } }));
        }
    });
}
