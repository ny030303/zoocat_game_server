import WebSocket from 'ws';
import { getUserUnits } from '../services/lobbyService';
import { getUserId } from './connectionRegistry';

export async function handleJoinLobby(ws: WebSocket, _payload?: unknown) {
    try {
        // 로그인된 연결의 userId 기준으로만 조회 (payload 의 userId 를 신뢰하지 않음)
        const userId = getUserId(ws);
        if (!userId) {
            return ws.send(JSON.stringify({ event: 'error', data: '로그인이 필요합니다' }));
        }

        const userUnits = await getUserUnits(userId);
        ws.send(JSON.stringify({ event: 'userJoined', data: { units: userUnits } }));
        console.log(`✅ 사용자가 로비에 참여:`, userUnits);
    } catch (error) {
        ws.send(JSON.stringify({ event: 'error', data: (error as Error).message }));
    }
}

export function handleLeaveLobby(ws: WebSocket, lobbyId: string) {
    ws.send(JSON.stringify({ event: 'userLeft', data: lobbyId }));
    console.log(`🚪 사용자가 로비 ${lobbyId}에서 나갔습니다.`);
}
