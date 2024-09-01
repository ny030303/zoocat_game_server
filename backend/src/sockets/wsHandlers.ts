import WebSocket, { Server, WebSocketServer } from 'ws';
import { authenticateUser, registerUser, UserCredentials, UserRegistration, UserProfile } from './auth';

export function setupSocketHandlers(server: any) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        console.log('A user connected');

        ws.on('message', async (data: string) => {
            try {
                const message = JSON.parse(data);
                const { event, payload } = message;

                switch (event) {
                    case 'signup':
                        try {
                            const result = await registerUser(payload as UserRegistration);
                            ws.send(JSON.stringify({ event: 'signupResult', data: result }));
                        } catch (error) {
                            ws.send(JSON.stringify({ event: 'signupError', data: (error as Error).message }));
                        }
                        break;

                    case 'login':
                        try {
                            const credentials = payload as UserCredentials;
                            console.log("Login credentials: ", credentials);
                            const userProfile: UserProfile | null = await authenticateUser(credentials);
                            if (userProfile) {
                                ws.send(JSON.stringify({ event: 'loginSuccess', data: { message: 'Login successful', userProfile } }));
                            } else {
                                const result = await registerUser(credentials);
                                const newUserProfile: UserProfile | null = await authenticateUser(credentials); // 재로그인
                                if (newUserProfile) {
                                    ws.send(JSON.stringify({ event: 'loginSuccess', data: { message: 'Login successful', userProfile: newUserProfile } }));
                                } else {
                                    ws.send(JSON.stringify({ event: 'loginFailure', data: { message: 'Invalid credentials' } }));
                                }
                            }
                        } catch (error) {
                            ws.send(JSON.stringify({ event: 'loginError', data: (error as Error).message }));
                        }
                        break;

                    case 'joinLobby':
                        const lobbyId = payload as string;
                        ws.send(JSON.stringify({ event: 'userJoined', data: ws }));
                        console.log(`User joined lobby ${lobbyId}`);
                        break;

                    case 'leaveLobby':
                        ws.send(JSON.stringify({ event: 'userLeft', data: ws }));
                        console.log(`User left lobby ${payload}`);
                        break;

                    case 'sendMessage':
                        const { lobbyId: msgLobbyId, message: chatMessage } = payload;
                        wss.clients.forEach((client: WebSocket) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ event: 'newMessage', data: { userId: ws, message: chatMessage } }));
                            }
                        });
                        console.log(`Message from user in lobby ${msgLobbyId}: ${chatMessage}`);
                        break;

                    default:
                        console.log('Unknown event:', event);
                }
            } catch (error) {
                ws.send(JSON.stringify({ event: 'error', data: 'Invalid message format' }));
            }
        });

        ws.on('close', () => {
            console.log('User disconnected');
        });

        ws.on('error', (error: Error) => {
            console.error('WebSocket error:', error);
        });
    });

    console.log('WebSocket server is running.');
}
