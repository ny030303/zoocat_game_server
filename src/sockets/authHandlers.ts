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
        const userProfile = await AuthService.authenticateUser(credentials);
        if (userProfile) {
            ws.send(JSON.stringify({ event: 'loginSuccess', data: { message: '로그인 성공', userProfile } }));
        } else {
            handleSignup(ws, credentials);
            // ws.send(JSON.stringify({ event: 'loginFailure', data: { message: '잘못된 자격 증명' } }));
        }
    } catch (error) {
        ws.send(JSON.stringify({ event: 'loginError', data: (error as Error).message }));
    }
}
