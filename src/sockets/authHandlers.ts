import WebSocket from 'ws';
import { AuthService } from '../services/authService';
import { UserService } from '../services/userService';
import { UserRegistration, UserCredentials } from '../models/userModel';
import { bind } from './connectionRegistry';

/** id·userName 이 길이 제한 안의 비어있지 않은 문자열인지 검증 (NoSQL 연산자 객체 주입 차단). */
function isValidCredential(c: unknown): c is { id: string; userName: string; underage?: unknown } {
    if (typeof c !== 'object' || c === null) return false;
    const { id, userName } = c as Record<string, unknown>;
    return (
        typeof id === 'string' &&
        id.length > 0 &&
        id.length <= 128 &&
        typeof userName === 'string' &&
        userName.length > 0 &&
        userName.length <= 32
    );
}

export async function handleSignup(ws: WebSocket, registrationData: UserRegistration) {
    try {
        if (!isValidCredential(registrationData)) {
            return ws.send(JSON.stringify({ event: 'signupError', data: '잘못된 요청입니다' }));
        }
        const result = await UserService.registerUser(registrationData);
        ws.send(JSON.stringify({ event: 'signupResult', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'signupError', data: (error as Error).message }));
    }
}

export async function handleLogin(ws: WebSocket, credentials: UserCredentials) {
    try {
        if (!isValidCredential(credentials)) {
            return ws.send(JSON.stringify({ event: 'loginError', data: '잘못된 요청입니다' }));
        }
        const { userProfile, isNewUser } = await AuthService.loginOrRegister(credentials);
        bind(userProfile.id, ws); // 이후 매칭 등 실시간 기능이 이 연결을 userId 로 찾는다
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
