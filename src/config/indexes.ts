import { Db } from 'mongodb';

/** 부팅 시 1회 호출. 이미 있으면 no-op. */
export async function ensureIndexes(db: Db): Promise<void> {
    await db.collection('devices').createIndexes([
        { key: { userId: 1 } },
        { key: { userId: 1, revokedAt: 1 } },
    ]);

    await db.collection('sessions').createIndexes([
        { key: { userId: 1 } },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // TTL — 청소용, 인가 판단은 코드에서 재검사
    ]);

    // provider 연결 (Phase 2) — 한 provider 가 두 계정에 붙는 것을 막는다
    await db.collection('users').createIndex(
        { providerType: 1, providerUserId: 1 },
        { unique: true, partialFilterExpression: { providerUserId: { $exists: true } } },
    );
}
