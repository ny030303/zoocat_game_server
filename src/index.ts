import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
// import { setupSocketHandlers } from './sockets/wsHandlers';
import { setupSocketHandlers } from './sockets/socketServer';
import { connectDb, getDb } from './config/db';

const app = express();
const port = Number(process.env.PORT) || 3000;

// HTTP 서버 생성
const httpServer = createServer(app);

// 소켓 서버 생성
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
    },
});

app.use(express.json());
// app.use('/api', router);

// 헬스체크 — 배포 컨테이너 healthcheck / deploy 스크립트가 폴링
app.get('/health', (_req: Request, res: Response) => {
    try {
        getDb();
        res.json({ ok: true });
    } catch {
        res.status(503).json({ ok: false });
    }
});

async function startServer() {
    try {
        await connectDb(); // 서버 시작 전에 DB 연결
        // await connectToDatabase(MONGO_URI, DB_NAME);
        
        // 소켓 핸들러 설정
        // setupSocketHandlers(io);
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

