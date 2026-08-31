import { randomUUID } from 'crypto';

export interface Match {
    id: string;
    players: readonly [string, string]; // 생성 순서 = [a, b]
    createdAt: number;
}

// 진행 중인 매치. 전부 인메모리(휘발성). 매치 종료 시 회수.
const matches = new Map<string, Match>();
const byPlayer = new Map<string, string>(); // userId -> matchId (역인덱스)

export function createMatch(a: string, b: string): Match {
    const match: Match = { id: randomUUID(), players: [a, b], createdAt: Date.now() };
    matches.set(match.id, match);
    byPlayer.set(a, match.id);
    byPlayer.set(b, match.id);
    return match;
}

export function getMatch(matchId: string): Match | undefined {
    return matches.get(matchId);
}

export function getMatchIdOf(userId: string): string | undefined {
    return byPlayer.get(userId);
}

export function opponentOf(matchId: string, userId: string): string | undefined {
    const match = matches.get(matchId);
    if (!match) return undefined;
    const [a, b] = match.players;
    if (a === userId) return b;
    if (b === userId) return a;
    return undefined;
}

/** 매치를 종료하고 역인덱스를 정리한다. 종료된 매치를 반환(없으면 undefined). */
export function endMatch(matchId: string): Match | undefined {
    const match = matches.get(matchId);
    if (!match) return undefined;
    matches.delete(matchId);
    for (const p of match.players) {
        if (byPlayer.get(p) === matchId) byPlayer.delete(p);
    }
    return match;
}

export function activeCount(): number {
    return matches.size;
}
