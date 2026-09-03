import * as queue from '../services/matchmakingService';
import * as matches from '../services/matchService';
import { sendTo } from './connectionRegistry';

/**
 * 큐·매치에서 userId 관련 상태를 정리하고 상대에게 통지한다.
 * 연결 종료(ws close) 와 logout 이 공유한다. (matchHandlers 를 import 하지 않는다)
 */
export function cleanupUserState(userId: string | undefined): void {
    if (!userId) return;
    queue.dequeue(userId);
    const matchId = matches.getMatchIdOf(userId);
    if (matchId) {
        const opponentId = matches.opponentOf(matchId, userId);
        matches.endMatch(matchId);
        if (opponentId) sendTo(opponentId, 'opponentLeft', { matchId });
    }
}
