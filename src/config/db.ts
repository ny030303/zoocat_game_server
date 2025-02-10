import { MongoClient, Db } from 'mongodb';
// import dotenv from 'dotenv';

// dotenv.config();

let dbInstance: Db | null = null; // 싱글톤 패턴을 위한 DB 인스턴스 저장

// const MONGO_URI = process.env.MONGO_URI as string;
// const DB_NAME = process.env.DB_NAME as string;
const MONGO_URI = 'mongodb://root:example@mongo:27017/zoocat?authSource=admin';
const DB_NAME = 'zoocat';
/**
 * MongoDB에 연결하고 DB 인스턴스를 반환하는 함수
 */
export async function connectDb(): Promise<Db> {
    if (dbInstance) {
        console.log("📌 기존 MongoDB 연결을 반환합니다.");
        return dbInstance; // 이미 연결되어 있으면 기존 인스턴스를 반환
    }

    try {
        const client = new MongoClient(MONGO_URI, {
            // useNewUrlParser: true,
            // useUnifiedTopology: true
        });

        await client.connect(); // MongoDB 연결
        dbInstance = client.db(DB_NAME); // DB 선택

        console.log("✅  MongoDB에 연결되었습니다.");
        return dbInstance;
    } catch (error) {
        console.error("❌  MongoDB 연결 실패:", error);
        process.exit(1); // 연결 실패 시 애플리케이션 종료
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
