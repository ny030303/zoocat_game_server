import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
// import router from './routes';
// import { setupSocketHandlers } from './sockets/socketHandlers';
import { setupSocketHandlers } from './sockets/wsHandlers';
import { connectToDatabase } from './db/db';

const app = express();
const port = 3000;

// HTTP 서버 생성
const httpServer = createServer(app);

// 소켓 서버 생성
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
    },
});

const MONGO_URI = 'mongodb://root:example@mongo:27017/zoocat?authSource=admin';
const DB_NAME = 'zoocat';

app.use(express.json());
// app.use('/api', router);

async function startServer() {
    try {
        await connectToDatabase(MONGO_URI, DB_NAME);
        // 소켓 핸들러 설정
        // setupSocketHandlers(io);
        setupSocketHandlers(httpServer);

        // 서버 시작
        httpServer.listen(port, () => {
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

