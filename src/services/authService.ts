import { UserRepository } from '../repositories/userRepository';
import { UserCredentials, UserProfile } from '../models/userModel';

export class AuthService {
    static async authenticateUser(credentials: UserCredentials): Promise<UserProfile | null> {
        const user = await UserRepository.findById(credentials.id);
        return user ? (user as unknown as UserProfile) : null;
    }
}
