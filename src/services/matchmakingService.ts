export type EnqueueResult =
    | { status: 'queued' }
    | { status: 'matched'; opponentId: string }
    | { status: 'rejected'; reason: string };

// FIFO 대기열 (userId). Node 단일 스레드라 동기 연산은 사실상 원자적이다.
// 단일 서버 인스턴스 전제 — 다중 인스턴스는 Redis 큐로 이전 필요(Out of Scope).
const queue: string[] = [];

/** 큐에 넣거나, 대기자가 있으면 그 사람과 매칭한다. */
export function enqueue(userId: string): EnqueueResult {
    if (queue.includes(userId)) {
        return { status: 'rejected', reason: '이미 매칭 대기 중입니다' };
    }
    const opponentId = queue.shift();
    if (opponentId !== undefined) {
        return { status: 'matched', opponentId };
    }
    queue.push(userId);
    return { status: 'queued' };
}

export function dequeue(userId: string): void {
    const i = queue.indexOf(userId);
    if (i >= 0) queue.splice(i, 1);
}

export function isQueued(userId: string): boolean {
    return queue.includes(userId);
}

export function queueSize(): number {
    return queue.length;
}
