import WebSocket, { Server, WebSocketServer } from 'ws';
import { authenticateUser, registerUser, UserCredentials, UserRegistration, UserProfile } from './auth';

export function setupSocketHandlers(server: any) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        console.log('사용자가 연결되었습니다');
        ws.on('message', async (data: string) => handleMessage(ws, data, wss));
        ws.on('close', () => console.log('사용자가 연결을 끊었습니다'));
        ws.on('error', (error: Error) => console.error('웹소켓 오류:', error));
    });

    console.log('웹소켓 서버가 실행 중입니다.');
}

// 들어오는 메시지를 파싱하고 적절한 핸들러를 호출하는 헬퍼 함수
async function handleMessage(ws: WebSocket, data: string, wss: WebSocketServer) {
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
                handleJoinLobby(ws, payload as string);
                break;

            case 'leaveLobby':
                handleLeaveLobby(ws, payload as string);
                break;

            case 'sendMessage':
                handleSendMessage(ws, payload, wss);
                break;

            default:
                console.log('알 수 없는 이벤트:', event);
        }
    } catch (error) {
        ws.send(JSON.stringify({ event: 'error', data: '잘못된 메시지 형식입니다' }));
    }
}

// 회원가입 처리 함수
async function handleSignup(ws: WebSocket, registrationData: UserRegistration) {
    try {
        const result = await registerUser(registrationData);
        ws.send(JSON.stringify({ event: 'signupResult', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'signupError', data: (error as Error).message }));
    }
}

// 로그인 처리 함수
async function handleLogin(ws: WebSocket, credentials: UserCredentials) {
    try {
        const userProfile = await authenticateUser(credentials);
        console.log(userProfile);
        if (userProfile) {
            ws.send(JSON.stringify({ event: 'loginSuccess', data: { message: '로그인 성공', userProfile } }));
        } else {
            const userProfile = await registerUser(credentials);
            if (userProfile) {
                ws.send(JSON.stringify({ event: 'loginSuccess', data: { message: '로그인 성공', userProfile: userProfile } }));
            } else {
                ws.send(JSON.stringify({ event: 'loginFailure', data: { message: '잘못된 자격 증명' } }));
            }
        }
    } catch (error) {
        ws.send(JSON.stringify({ event: 'loginError', data: (error as Error).message }));
    }
}

// 로비 입장 처리 함수
function handleJoinLobby(ws: WebSocket, lobbyId: string) {
    ws.send(JSON.stringify({ event: 'userJoined', data: lobbyId }));
    console.log(`사용자가 로비 ${lobbyId}에 참여했습니다.`);
}

// 로비 나가기 처리 함수
function handleLeaveLobby(ws: WebSocket, lobbyId: string) {
    ws.send(JSON.stringify({ event: 'userLeft', data: lobbyId }));
    console.log(`사용자가 로비 ${lobbyId}에서 나갔습니다.`);
}

// 메시지 전송 처리 함수
function handleSendMessage(ws: WebSocket, payload: any, wss: WebSocketServer) {
    const { lobbyId, message } = payload;
    broadcastMessage(ws, message, wss);
    console.log(`로비 ${lobbyId}의 사용자로부터 메시지: ${message}`);
}

// 모든 클라이언트에게 메시지를 브로드캐스트하는 유틸리티 함수
function broadcastMessage(ws: WebSocket, message: string, wss: WebSocketServer) {
    wss.clients.forEach((client: WebSocket) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'newMessage', data: { message } }));
        }
    });
}
