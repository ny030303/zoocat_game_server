import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { setupSocketHandlers } from './sockets/socketServer';
import { connectDb, getDb } from './config/db';
import { ensureIndexes } from './config/indexes';
import * as matchmaking from './services/matchmakingService';
import * as matchService from './services/matchService';
import * as connectionRegistry from './sockets/connectionRegistry';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const app = express();
const port = Number(process.env.PORT) || 3000;

// HTTP 서버 생성
const httpServer = createServer(app);

app.use(express.json());

// 헬스체크 — 배포 컨테이너 healthcheck / deploy 스크립트가 폴링
app.get('/health', (_req: Request, res: Response) => {
    try {
        getDb();
        res.json({ ok: true });
    } catch {
        res.status(503).json({ ok: false });
    }
});

// 관리자용 매칭 풀 조회.
//   - ADMIN_TOKEN 미설정 시 엔드포인트 비활성(404)
//   - 활성 시 헤더 x-admin-token 이 일치해야 함
//   - Caddy 가 모든 경로를 프록시하므로 공개 도메인에서도 도달 가능 → 토큰으로만 보호.
//     더 강하게 막으려면 박스에서 curl localhost:3000/debug/matchmaking 로만 접근.
app.get('/debug/matchmaking', (req: Request, res: Response) => {
    if (!ADMIN_TOKEN) return res.status(404).end();
    if (req.get('x-admin-token') !== ADMIN_TOKEN) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    res.json({
        ts: new Date().toISOString(),
        queue: matchmaking.snapshot(),
        matches: { count: matchService.activeCount(), list: matchService.snapshot() },
        connections: {
            online: connectionRegistry.onlineCount(),
            userIds: connectionRegistry.onlineUserIds(),
        },
    });
});

async function startServer() {
    try {
        await connectDb(); // 서버 시작 전에 DB 연결
        await ensureIndexes(getDb());

        setupSocketHandlers(httpServer);

        // 서버 시작
        httpServer.listen(port, '0.0.0.0', () => {
            console.log(`
                #############################################
                    🛡️ Server listening on port: ${port} 🛡️
                #############################################    
            `);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
    }
}

startServer();

