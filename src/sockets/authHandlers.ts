import WebSocket from 'ws';
import { AuthService } from '../services/authService';
import { UserService } from '../services/userService';
import { UserRegistration, UserCredentials } from '../models/userModel';

export async function handleSignup(ws: WebSocket, registrationData: UserRegistration) {
    try {
        const result = await UserService.registerUser(registrationData);
        ws.send(JSON.stringify({ event: 'signupResult', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'signupError', data: (error as Error).message }));
    }
}

export async function handleLogin(ws: WebSocket, credentials: UserCredentials) {
    try {
        const { userProfile, isNewUser } = await AuthService.loginOrRegister(credentials);
        ws.send(JSON.stringify({
            event: 'loginSuccess',
            data: {
                message: isNewUser ? '신규 가입 및 로그인' : '로그인 성공',
                userProfile,
                isNewUser,
            },
        }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'loginError', data: (error as Error).message }));
    }
}
