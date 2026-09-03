import { getDb } from '../config/db';
import { UserProfile } from '../models/userModel';

export class UserRepository {
    private static getCollection() {
        return getDb().collection('users');
    }

    static async findById(id: string) {
        return await this.getCollection().findOne({ id: String(id) });
    }

    static async findByProviderUserId(providerType: string, providerUserId: string) {
        return await this.getCollection().findOne({
            providerType: String(providerType),
            providerUserId: String(providerUserId),
        });
    }

    /** 서버가 조립한 화이트리스트 문서만 저장한다. 클라 객체를 spread 하지 않는다. */
    static async insertUser(p: UserProfile): Promise<void> {
        await this.getCollection().insertOne({
            id: p.id,
            username: p.username,
            level: p.level,
            experience: p.experience,
            friends: p.friends,
            country: p.country,
            language: p.language,
            selectedUnits: p.selectedUnits,
            gold: p.gold,
            gems: p.gems,
            underage: p.underage,
        });
    }

    static async updateDeck(userId: string, newDeck: string[]) {
        const result = await this.getCollection().updateOne(
            { id: String(userId) },
            { $set: { selectedUnits: newDeck } },
        );
        return result.modifiedCount > 0;
    }

    /** Phase 2: 아직 미연결일 때만 provider 를 연결 (조건부 원자 갱신). */
    static async linkProvider(userId: string, providerType: string, providerUserId: string): Promise<boolean> {
        const result = await this.getCollection().updateOne(
            { id: String(userId), providerUserId: { $exists: false } },
            { $set: { providerType, providerUserId, linkedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }
}
