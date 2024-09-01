import { Server as SocketIOServer, Socket } from 'socket.io';
import { authenticateUser, registerUser, UserCredentials, UserRegistration, UserProfile } from './auth';

export function setupSocketHandlers(io: SocketIOServer) {
    io.on('connection', (socket: Socket) => {
        console.log('a user connected: ' + socket.id);
        // 모든 이벤트를 수신하는 리스너
        socket.onAny((event, ...args) => {
            console.log(`Received event: ${event}, with arguments:`, args);
            
            // 여기서 각 이벤트에 대한 추가 처리 로직을 추가할 수 있습니다.
            // 예를 들어, 특정 이벤트를 구별하거나 로그를 저장할 수 있습니다.
        });

        // Handle user signup
        socket.on('signup', async (userData: UserRegistration) => {
            try {
                const result = await registerUser(userData);
                socket.emit('signupResult', result);
            } catch (error) {
                socket.emit('signupError', (error as Error).message);
            }
        });

        // Handle user login
        socket.on('login', async (credentials: UserCredentials) => {
            try {
                console.log("login credentials: " + credentials);
                const userProfile: UserProfile | null = await authenticateUser(credentials);
                if (userProfile) {
                    socket.emit('loginSuccess', { message: 'Login successful', userProfile });
                } else { // 유저 데이터가 없는 경우
                    const result = await registerUser(credentials);
                    const userProfile: UserProfile | null = await authenticateUser(credentials); //재로그인
                    if (userProfile) {
                        socket.emit('loginSuccess', { message: 'Login successful', userProfile });
                    } else {
                        socket.emit('loginFailure', { message: 'Invalid credentials' });
                    }
                    
                }
            } catch (error) {
                socket.emit('loginError', (error as Error).message);
            }
        });

        // Handle lobby interactions
        socket.on('joinLobby', (lobbyId: string) => {
            socket.join(lobbyId);
            socket.to(lobbyId).emit('userJoined', socket.id);
            console.log(`${socket.id} joined lobby ${lobbyId}`);
        });

        socket.on('leaveLobby', (lobbyId: string) => {
            socket.leave(lobbyId);
            socket.to(lobbyId).emit('userLeft', socket.id);
            console.log(`${socket.id} left lobby ${lobbyId}`);
        });

        socket.on('sendMessage', (lobbyId: string, message: string) => {
            socket.to(lobbyId).emit('newMessage', { userId: socket.id, message });
            console.log(`Message from ${socket.id} in lobby ${lobbyId}: ${message}`);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('user disconnected: ' + socket.id);
        });
    });
}
