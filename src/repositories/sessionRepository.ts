import { getDb } from '../config/db';

export interface SessionDoc {
    _id: string; // sha256(token) — 원문 토큰은 저장하지 않는다
    userId: string;
    deviceId: string;
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date; // 유휴 만료
    absoluteExpiresAt: Date; // 절대 만료
    ipHash?: string;
    revokedAt?: Date;
}

function col() {
    return getDb().collection<SessionDoc>('sessions');
}

export const SessionRepository = {
    async insert(doc: SessionDoc): Promise<void> {
        await col().insertOne(doc);
    },

    async get(tokenHash: string): Promise<SessionDoc | null> {
        return col().findOne({ _id: String(tokenHash) });
    },

    /** lastSeenAt 갱신 + expiresAt 슬라이딩 (절대 만료 초과 금지). */
    async touch(tokenHash: string, lastSeenAt: Date, expiresAtCandidate: Date): Promise<void> {
        await col().updateOne({ _id: String(tokenHash) }, [
            {
                $set: {
                    lastSeenAt,
                    expiresAt: { $min: ['$absoluteExpiresAt', expiresAtCandidate] },
                },
            },
        ]);
    },

    async delete(tokenHash: string): Promise<void> {
        await col().deleteOne({ _id: String(tokenHash) });
    },

    async deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void> {
        const filter: Record<string, unknown> = { userId: String(userId) };
        if (exceptTokenHash) filter._id = { $ne: String(exceptTokenHash) };
        await col().deleteMany(filter);
    },
};
