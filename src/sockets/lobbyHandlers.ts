import WebSocket from 'ws';
import { getUserUnits } from '../services/lobbyService';
import { getUserUnitsDTO } from '../models/unitModel';

export async function handleJoinLobby(ws: WebSocket, dto: getUserUnitsDTO) {
    try {
        const userUnits = await getUserUnits(dto.userId);
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
