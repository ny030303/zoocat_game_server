import WebSocket, { WebSocketServer } from 'ws';
import { setupEventHandlers } from './eventHandlers';
import { handleDisconnect } from './matchHandlers';
import { allow, clear as clearRateLimit } from './rateLimiter';

type LiveSocket = WebSocket & { isAlive?: boolean };

export function setupSocketHandlers(server: any) {
    // 허용 Origin 목록 (쉼표 구분). 미설정 시 전체 허용(경고).
    const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    // maxPayload: 프레임 크기 상한 (기본 100MB → 64KB). 거대 payload 중계 증폭 차단.
    const wss = new WebSocketServer({
        server,
        host: '0.0.0.0',
        maxPayload: 64 * 1024,
        verifyClient: ({ origin }, done) => {
            if (allowedOrigins.length === 0) return done(true);
            if (!origin) return done(true); // 네이티브 클라이언트(Origin 헤더 없음) 허용
            done(allowedOrigins.includes(origin));
        },
    });

    if (allowedOrigins.length === 0) {
        console.warn('⚠️  ALLOWED_ORIGINS 미설정 — 모든 브라우저 Origin 의 WebSocket 연결을 허용합니다 (CSWSH 위험)');
    }

    wss.on('connection', (ws: LiveSocket) => {
        console.log('사용자가 연결되었습니다');
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', async (data: string) => {
            if (!allow(ws)) {
                ws.send(JSON.stringify({ event: 'error', data: '요청이 너무 많습니다' }));
                return;
            }
            return setupEventHandlers(ws, data, wss);
        });
        ws.on('close', () => {
            handleDisconnect(ws);
            clearRateLimit(ws);
            console.log('사용자가 연결을 끊었습니다');
        });
        ws.on('error', (error: Error) => console.error('웹소켓 오류:', error));
    });

    // 죽은(half-open) 연결 정리 — 30초마다 ping, 응답 없으면 terminate.
    const heartbeat = setInterval(() => {
        wss.clients.forEach((client) => {
            const ws = client as LiveSocket;
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30_000);
    wss.on('close', () => clearInterval(heartbeat));

    console.log('✅  웹소켓 서버가 실행 중입니다.');
}
