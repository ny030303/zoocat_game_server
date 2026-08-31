import WebSocket from 'ws';
import { getUserId, sendTo, unbind } from './connectionRegistry';
import * as queue from '../services/matchmakingService';
import * as matches from '../services/matchService';
import { UserRepository } from '../repositories/userRepository';

function send(ws: WebSocket, event: string, data: unknown): void {
    ws.send(JSON.stringify({ event, data }));
}

type UserRow = { id: string; username: string; level: number; selectedUnits?: string[] };

function playerView(u: UserRow) {
    return {
        userId: u.id,
        username: u.username,
        level: u.level,
        deck: u.selectedUnits ?? [],
    };
}

/** 매칭 큐 진입. 대기자가 있으면 즉시 페어링해 양쪽에 matchFound 를 보낸다. */
export async function handleEnqueue(ws: WebSocket): Promise<void> {
    const userId = getUserId(ws);
    if (!userId) {
        return send(ws, 'error', '로그인이 필요합니다');
    }
    if (matches.getMatchIdOf(userId)) {
        return send(ws, 'error', '이미 매치 중입니다');
    }

    const result = queue.enqueue(userId);
    if (result.status === 'rejected') {
        return send(ws, 'error', result.reason);
    }
    if (result.status === 'queued') {
        return send(ws, 'queued', null);
    }

    // matched — 매치 생성 후 양쪽 프로필/덱 조회
    const opponentId = result.opponentId;
    const match = matches.createMatch(userId, opponentId);

    const [me, opp] = await Promise.all([
        UserRepository.findById(userId),
        UserRepository.findById(opponentId),
    ]);
    if (!me || !opp) {
        matches.endMatch(match.id);
        send(ws, 'error', '상대 정보를 불러오지 못했습니다');
        sendTo(opponentId, 'error', '상대 정보를 불러오지 못했습니다');
        return;
    }

    const meView = playerView(me as unknown as UserRow);
    const oppView = playerView(opp as unknown as UserRow);

    send(ws, 'matchFound', { matchId: match.id, you: meView, opponent: oppView });
    const delivered = sendTo(opponentId, 'matchFound', {
        matchId: match.id,
        you: oppView,
        opponent: meView,
    });
    if (!delivered) {
        // 페어링 직후 상대 연결이 끊긴 경우 — 매치 취소
        matches.endMatch(match.id);
        send(ws, 'error', '상대 연결이 끊겼습니다');
    }
}

/** 매칭 큐 이탈. */
export function handleDequeue(ws: WebSocket): void {
    const userId = getUserId(ws);
    if (!userId) return;
    queue.dequeue(userId);
    send(ws, 'queueLeft', null);
}

/** 매치 중 메시지를 상대에게 그대로 중계한다(서버는 payload 를 해석하지 않음). */
export function handleMatchMessage(ws: WebSocket, msg: unknown): void {
    const userId = getUserId(ws);
    if (!userId) return;

    if (typeof msg !== 'object' || msg === null) {
        return send(ws, 'error', '잘못된 요청입니다');
    }
    const { matchId, payload } = msg as { matchId?: unknown; payload?: unknown };
    if (typeof matchId !== 'string') {
        return send(ws, 'error', '잘못된 요청입니다');
    }

    const myMatchId = matches.getMatchIdOf(userId);
    if (!myMatchId || myMatchId !== matchId) {
        return send(ws, 'error', '유효하지 않은 매치입니다');
    }

    const opponentId = matches.opponentOf(myMatchId, userId);
    if (opponentId) {
        sendTo(opponentId, 'matchMessage', { matchId: myMatchId, from: userId, payload });
    }
}

/** 본인이 매치를 떠난다. 상대에게 opponentLeft, 본인에게 matchEnded. */
export function handleLeaveMatch(ws: WebSocket): void {
    const userId = getUserId(ws);
    if (!userId) return;

    const matchId = matches.getMatchIdOf(userId);
    if (!matchId) return;

    const opponentId = matches.opponentOf(matchId, userId);
    matches.endMatch(matchId);
    queue.dequeue(userId);

    if (opponentId) sendTo(opponentId, 'opponentLeft', { matchId });
    send(ws, 'matchEnded', { matchId, reason: 'left' });
}

/** socketServer 의 ws.on('close') 에서 호출. 큐·매치에서 정리하고 상대에게 통지. */
export function handleDisconnect(ws: WebSocket): void {
    const userId = unbind(ws);
    if (!userId) return;

    queue.dequeue(userId);
    const matchId = matches.getMatchIdOf(userId);
    if (matchId) {
        const opponentId = matches.opponentOf(matchId, userId);
        matches.endMatch(matchId);
        if (opponentId) sendTo(opponentId, 'opponentLeft', { matchId });
    }
}
