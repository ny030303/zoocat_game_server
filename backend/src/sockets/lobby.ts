import { Db } from 'mongodb';
import { getDb } from '../db/db';

export interface getUserUnitsDTO {
    userId: string;
}

export async function getUserUnits(userId: string) {
    const db: Db = getDb();
    const unitsCollection = db.collection('units');

    // 유저의 유닛 데이터를 가져오는 로직
    const userUnits = await unitsCollection.findOne({ user_id: userId });

    if (!userUnits) {
        throw new Error(`No units data found for user with ID: ${userId}`);
    }

    return userUnits.units;
}
