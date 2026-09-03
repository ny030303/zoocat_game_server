import { UserRepository } from '../repositories/userRepository';
import { UnitRepository } from '../repositories/unitRepository';
import { UserProfile } from '../models/userModel';
import { newId } from './credentialService';

export class UserService {
    /** 신규 유저 프로필을 서버가 조립한다. 클라 입력은 userName / underage 만. */
    static buildNewProfile(userId: string, userName: string, underage: boolean): UserProfile {
        return {
            id: userId,
            username: userName,
            level: 1,
            experience: 0,
            friends: [],
            country: '',
            language: 'ko',
            selectedUnits: ['1001', '1002', '1003', '1004', '1005'],
            gold: 1000,
            gems: 0,
            underage,
        };
    }

    /** 계정 + 초기 유닛 로스터 생성. userId 는 서버가 발급. */
    static async createAccount(userName: string, underage: boolean): Promise<UserProfile> {
        const userId = newId();
        const profile = this.buildNewProfile(userId, userName, underage);
        await UserRepository.insertUser(profile);
        await UnitRepository.createUserUnits(userId);
        return profile;
    }

    static async updateDeck(userId: string, newDeck: string[]) {
        const user = await UserRepository.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // 덱 형식 검사: 정확히 5개, 모두 비어있지 않은 문자열, 중복 없음
        if (
            !Array.isArray(newDeck) ||
            newDeck.length !== 5 ||
            !newDeck.every((u) => typeof u === 'string' && u.length > 0) ||
            new Set(newDeck).size !== 5
        ) {
            throw new Error('Deck must contain exactly 5 distinct unit ids');
        }

        // 보유한 유닛만 덱에 넣을 수 있다
        const roster = await UnitRepository.getUnitsByUserId(userId);
        const ownedIds = new Set(
            ((roster as unknown as { units?: { id: string }[] })?.units ?? []).map((u) => String(u.id)),
        );
        if (!newDeck.every((u) => ownedIds.has(u))) {
            throw new Error('보유하지 않은 유닛이 덱에 있습니다');
        }

        const success = await UserRepository.updateDeck(userId, newDeck);
        if (!success) {
            throw new Error('Failed to update deck');
        }

        return { message: 'Deck updated successfully', newDeck };
    }
}
