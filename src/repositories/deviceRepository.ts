import { getDb } from '../config/db';

export interface DeviceDoc {
    _id: string; // deviceId (UUID)
    userId: string;
    secretHash: string;
    hashVersion: number;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt?: Date;
}

function col() {
    return getDb().collection<DeviceDoc>('devices');
}

export const DeviceRepository = {
    async insert(doc: DeviceDoc): Promise<void> {
        await col().insertOne(doc);
    },

    /** 폐기되지 않은 device row. 없으면 null. */
    async findActive(deviceId: string, userId: string): Promise<DeviceDoc | null> {
        return col().findOne({
            _id: String(deviceId),
            userId: String(userId),
            revokedAt: { $exists: false },
        });
    },

    async touch(deviceId: string): Promise<void> {
        await col().updateOne({ _id: String(deviceId) }, { $set: { lastSeenAt: new Date() } });
    },

    async countActive(userId: string): Promise<number> {
        return col().countDocuments({ userId: String(userId), revokedAt: { $exists: false } });
    },

    /** 활성 device 가 상한을 넘었을 때 가장 오래 안 쓴 것을 폐기. */
    async revokeOldest(userId: string): Promise<void> {
        const oldest = await col()
            .find({ userId: String(userId), revokedAt: { $exists: false } })
            .sort({ lastSeenAt: 1 })
            .limit(1)
            .next();
        if (oldest) {
            await col().updateOne({ _id: oldest._id }, { $set: { revokedAt: new Date() } });
        }
    },

    async revokeAllForUser(userId: string): Promise<void> {
        await col().updateMany({ userId: String(userId) }, { $set: { revokedAt: new Date() } });
    },
};
