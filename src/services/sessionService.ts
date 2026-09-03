import { createHash, randomBytes } from 'crypto';
import { env } from '../config/env';
import { SessionRepository } from '../repositories/sessionRepository';

function sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

function hashIp(ip: string | undefined): string | undefined {
    return ip ? createHash('sha256').update(ip + env.SESSION_IP_SALT).digest('hex') : undefined;
}

export interface SessionView {
    userId: string;
    deviceId: string;
    tokenHash: string;
}

export const SessionService = {
    /** 새 세션 발급. 원문 token 은 이 반환값으로만 밖에 나간다. */
    async issue(userId: string, deviceId: string, ip?: string): Promise<{ token: string; tokenHash: string }> {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = sha256(token);
        const now = Date.now();
        await SessionRepository.insert({
            _id: tokenHash,
            userId,
            deviceId,
            createdAt: new Date(now),
            lastSeenAt: new Date(now),
            expiresAt: new Date(now + env.SESSION_IDLE_TTL_MS),
            absoluteExpiresAt: new Date(now + env.SESSION_ABSOLUTE_TTL_MS),
            ipHash: hashIp(ip),
        });
        return { token, tokenHash };
    },

    /** 토큰 유효성 검사. 만료·폐기면 null. */
    async verify(token: string): Promise<SessionView | null> {
        const tokenHash = sha256(token);
        const s = await SessionRepository.get(tokenHash);
        if (!s || s.revokedAt) return null;
        const now = Date.now();
        if (now >= s.expiresAt.getTime() || now >= s.absoluteExpiresAt.getTime()) return null;
        return { userId: s.userId, deviceId: s.deviceId, tokenHash };
    },

    async touch(tokenHash: string): Promise<void> {
        const now = Date.now();
        await SessionRepository.touch(tokenHash, new Date(now), new Date(now + env.SESSION_IDLE_TTL_MS));
    },

    async revoke(tokenHash: string): Promise<void> {
        await SessionRepository.delete(tokenHash);
    },

    /** 권한 상승(provider 링크 등)·이상 감지 시 해당 계정 세션 정리. */
    async revokeAllForUser(userId: string, exceptTokenHash?: string): Promise<void> {
        await SessionRepository.deleteAllForUser(userId, exceptTokenHash);
    },
};
