import WebSocket, { WebSocketServer } from 'ws';
import { setupEventHandlers } from './eventHandlers';

export function setupSocketHandlers(server: any) {
    const wss = new WebSocketServer({ server, host: '0.0.0.0' });

    wss.on('connection', (ws: WebSocket) => {
        console.log('사용자가 연결되었습니다');
        ws.on('message', async (data: string) => setupEventHandlers(ws, data, wss));
        ws.on('close', () => console.log('사용자가 연결을 끊었습니다'));
        ws.on('error', (error: Error) => console.error('웹소켓 오류:', error));
    });

    console.log('✅  웹소켓 서버가 실행 중입니다.');
}
