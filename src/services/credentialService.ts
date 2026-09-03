import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

// device row 가 없을 때도 상수시간 비교 1회를 수행하기 위한 더미.
const DUMMY_HASH = createHmac('sha256', 'dummy').update('dummy:dummy').digest('hex');

export function newId(): string {
    return randomUUID();
}

/** 32바이트 CSPRNG → base64url 43자. */
export function generateDeviceSecret(): string {
    return randomBytes(32).toString('base64url');
}

export function hashSecret(userId: string, secret: string): string {
    return createHmac('sha256', env.AUTH_PEPPER).update(`${userId}:${secret}`).digest('hex');
}

/**
 * device row 의 secretHash 와 (userId, secret) 를 상수시간 비교.
 * row 가 없으면 더미 해시로 비교해 응답 시간을 균일화한다(계정 존재 여부 타이밍 누출 방지).
 */
export function verifySecret(storedHash: string | undefined, userId: string, secret: string): boolean {
    const computed = Buffer.from(hashSecret(userId, secret), 'hex');
    const target = Buffer.from(storedHash ?? DUMMY_HASH, 'hex');
    if (computed.length !== target.length) return false;
    const eq = timingSafeEqual(computed, target);
    return storedHash !== undefined && eq;
}
