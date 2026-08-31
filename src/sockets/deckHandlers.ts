import WebSocket from 'ws';
import { UserService } from '../services/userService';
import { getUserId } from './connectionRegistry';

export async function handleUpdateDeck(ws: WebSocket, payload: any) {
    try {
        // payload.userId 를 신뢰하지 않는다 — 로그인된 연결의 userId 기준으로만 처리 (IDOR 방지)
        const userId = getUserId(ws);
        if (!userId) {
            return ws.send(JSON.stringify({ event: 'deckUpdateError', data: '로그인이 필요합니다' }));
        }

        const newDeck = payload?.newDeck;
        const result = await UserService.updateDeck(userId, newDeck);

        ws.send(JSON.stringify({ event: 'deckUpdated', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ event: 'deckUpdateError', data: (error as Error).message }));
    }
}
