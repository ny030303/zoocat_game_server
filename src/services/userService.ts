import { UserRepository } from '../repositories/userRepository';
import { UnitRepository } from '../repositories/unitRepository';
import { UserProfile, UserRegistration } from '../models/userModel';

export class UserService {
    static async registerUser(userData: UserRegistration): Promise<{ message: string; userProfile: UserProfile }> {
        const userExists = await UserRepository.findByUsername(userData.userName);
        if (userExists) {
            throw new Error('User already exists');
        }

        const newUserProfile: UserProfile = {
            id: userData.id,
            username: userData.userName,
            level: 1,
            experience: 0,
            friends: [],
            country: "",
            language: "ko",
            selectedUnits: ["1001", "1002", "1003", "1004", "1005"],
            gold: 1000,
            gems: 0
        };

        await UserRepository.createUser(userData, newUserProfile);
        await UnitRepository.createUserUnits(userData.id);

        return { message: 'User registered successfully', userProfile: newUserProfile };
    }

    static async updateDeck(userId: string, newDeck: string[]) {
        // 유저 정보 조회
        const user = await UserRepository.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // 덱 유효성 검사 (유닛 ID 검증)
        if (!Array.isArray(newDeck) || newDeck.length !== 5) {
            throw new Error('Deck must contain exactly 5 units');
        }

        // 덱 업데이트
        const success = await UserRepository.updateDeck(userId, newDeck);
        if (!success) {
            throw new Error('Failed to update deck');
        }

        return { message: 'Deck updated successfully', newDeck };
    }
}
