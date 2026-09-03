import { UserProfile } from '../models/userModel';
import { UserService } from './userService';
import { UserRepository } from '../repositories/userRepository';
import { DeviceRepository } from '../repositories/deviceRepository';
import { SessionService } from './sessionService';
import { generateDeviceSecret, hashSecret, newId, verifySecret } from './credentialService';

export interface AuthResult {
    userId: string;
    deviceId: string;
    deviceSecret?: string; // register 응답에만
    token: string;
    tokenHash: string;
    userProfile: UserProfile;
}

export interface ResumeResult {
    userId: string;
    deviceId: string;
    tokenHash: string;
    userProfile: UserProfile;
}

export const AuthService = {
    /** 최초 진입 — 서버가 userId + deviceSecret 발급. */
    async register(userName: string, underage: boolean, ip?: string): Promise<AuthResult> {
        const profile = await UserService.createAccount(userName, underage);
        const deviceId = newId();
        const deviceSecret = generateDeviceSecret();
        await DeviceRepository.insert({
            _id: deviceId,
            userId: profile.id,
            secretHash: hashSecret(profile.id, deviceSecret),
            hashVersion: 1,
            createdAt: new Date(),
            lastSeenAt: new Date(),
        });
        const { token, tokenHash } = await SessionService.issue(profile.id, deviceId, ip);
        return { userId: profile.id, deviceId, deviceSecret, token, tokenHash, userProfile: profile };
    },

    /** 게스트 로그인 — userId + deviceId + deviceSecret 검증. */
    async loginGuest(
        userId: string,
        deviceId: string,
        deviceSecret: string,
        ip?: string,
    ): Promise<AuthResult | null> {
        const row = await DeviceRepository.findActive(deviceId, userId);
        // row 가 없어도 verifySecret 이 더미 비교 1회 수행 → 타이밍 균일화
        if (!verifySecret(row?.secretHash, userId, deviceSecret)) return null;
        const profile = (await UserRepository.findById(userId)) as unknown as UserProfile | null;
        if (!profile) return null;
        await DeviceRepository.touch(deviceId);
        const { token, tokenHash } = await SessionService.issue(userId, deviceId, ip);
        return { userId, deviceId, token, tokenHash, userProfile: profile };
    },

    /** 세션 토큰으로 복원. */
    async resume(token: string): Promise<ResumeResult | null> {
        const s = await SessionService.verify(token);
        if (!s) return null;
        const profile = (await UserRepository.findById(s.userId)) as unknown as UserProfile | null;
        if (!profile) return null;
        await SessionService.touch(s.tokenHash);
        return { userId: s.userId, deviceId: s.deviceId, tokenHash: s.tokenHash, userProfile: profile };
    },
};
