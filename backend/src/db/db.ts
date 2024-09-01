import { MongoClient, Db } from 'mongodb';

let db: Db;

export async function connectToDatabase(uri: string, dbName: string) {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`Connected to database: ${dbName}`);
}

export function getDb(): Db {
    if (!db) {
        throw new Error("Database not initialized. Call connectToDatabase first.");
    }
    return db;
}
