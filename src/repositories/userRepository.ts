import { getDb } from '../config/db';
import { UserRegistration, UserProfile } from '../models/userModel';

export class UserRepository {
    private static getCollection() {
        return getDb().collection('users'); // 필요할 때만 `getDb()` 호출
    }

    static async findByUsername(username: string) {
        const usersCollection = this.getCollection();
        // String() 강제로 NoSQL 연산자 객체({$ne:...} 등) 주입 차단
        return await usersCollection.findOne({ username: String(username) });
    }

    static async findById(id: string) {
        const usersCollection = this.getCollection();
        return await usersCollection.findOne({ id: String(id) });
    }

    static async createUser(userData: UserRegistration, profile: UserProfile) {
        const usersCollection = this.getCollection();
        // 클라 페이로드(userData)를 그대로 펼치지 않는다 — 서버가 만든 profile + 화이트리스트 필드만 저장.
        // mass-assignment 차단: 클라가 deviceSecretHash / providerUserId 등 임의 키를 심는 것을 막음.
        return await usersCollection.insertOne({
            ...profile,
            underage: String(userData.underage ?? ''),
        });
    }

     // 사용자 덱 변경 (selectedUnits 업데이트)
     static async updateDeck(userId: string, newDeck: string[]) {
        const usersCollection = this.getCollection();
        const result = await usersCollection.updateOne(
            { id: String(userId) },
            { $set: { selectedUnits: newDeck } }
        );
        return result.modifiedCount > 0;
    }
}
