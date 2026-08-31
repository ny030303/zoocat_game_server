import { MongoClient, Db } from 'mongodb';

let dbInstance: Db | null = null;
const MONGO_URI = process.env.MONGO_URI
    ?? 'mongodb://root:example@localhost:27017/zoocat?authSource=admin'; // 로컬(호스트 실행) fallback
const DB_NAME = process.env.DB_NAME ?? 'zoocat';

/**
 * MongoDB에 연결하고 DB 인스턴스를 반환하는 함수
 */
export async function connectDb(): Promise<Db> {
    if (dbInstance) {
        console.log("📌 기존 MongoDB 연결을 반환합니다.");
        return dbInstance;
    }

    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        dbInstance = client.db(DB_NAME);
        console.log("✅  MongoDB에 연결되었습니다.");
        return dbInstance;
    } catch (error) {
        console.error("❌  MongoDB 연결 실패:", error);
        process.exit(1);
    }
}

/**
 * DB 인스턴스를 반환하는 함수 (연결이 없을 경우 예외 발생)
 */
export function getDb(): Db {
    if (!dbInstance) {
        throw new Error("❌  데이터베이스가 연결되지 않았습니다. `connectDb()`를 먼저 호출하세요.");
    }
    return dbInstance;
}
