import WebSocket, { WebSocketServer } from 'ws';

export function handleSendMessage(ws: WebSocket, payload: any, wss: WebSocketServer) {
    const { lobbyId, message } = payload;
    broadcastMessage(ws, message, wss);
    console.log(`💬 로비 ${lobbyId}의 사용자로부터 메시지: ${message}`);
}

function broadcastMessage(ws: WebSocket, message: string, wss: WebSocketServer) {
    wss.clients.forEach((client: WebSocket) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'newMessage', data: { message } }));
        }
    });
}
