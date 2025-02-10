import WebSocket from 'ws';
import { UserService } from '../services/userService';

export async function handleUpdateDeck(ws: WebSocket, payload: any) {
    try {
        const { userId, newDeck } = payload;

        // 덱 업데이트 실행
        const result = await UserService.updateDeck(userId, newDeck);

        // 성공 응답 전송
        ws.send(JSON.stringify({ event: 'deckUpdated', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'deckUpdateError', data: (error as Error).message }));
    }
}
