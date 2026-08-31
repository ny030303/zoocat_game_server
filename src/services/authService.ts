import { UserRepository } from '../repositories/userRepository';
import { UserService } from './userService';
import { UserCredentials, UserProfile } from '../models/userModel';

export class AuthService {
    /**
     * device id 로 유저를 조회하고, 없으면 가입까지 처리한다 (get-or-create).
     * 게스트/디바이스 로그인 방식이라 별도 자격 증명 검증은 없다.
     */
    static async loginOrRegister(
        credentials: UserCredentials
    ): Promise<{ userProfile: UserProfile; isNewUser: boolean }> {
        const existing = await UserRepository.findById(credentials.id);
        if (existing) {
            return { userProfile: existing as unknown as UserProfile, isNewUser: false };
        }

        const { userProfile } = await UserService.registerUser(credentials);
        return { userProfile, isNewUser: true };
    }
}
