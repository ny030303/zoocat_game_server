import { Db } from 'mongodb';
import { getDb } from '../config/db';
import { Unit } from '../models/unitModel';

export class UnitRepository {
    static async getUnitsByUserId(userId: string) {
        const unitsCollection = this.getUnitsCollection();
        return await unitsCollection.findOne({ userId });
        // throw new Error('Method not implemented.');
    }
    private static getUnitsCollection() {
        return getDb().collection('units'); // 필요할 때만 `getDb()` 호출
    }
    static async createUserUnits(userId: string) {
        const initialUnits: Unit[] = [
            { id: "1001", unlock: 1, lv: 1, exp: 0, piece: 30 },
            { id: "1002", unlock: 1, lv: 1, exp: 0, piece: 20 },
            { id: "1003", unlock: 1, lv: 1, exp: 0, piece: 0 },
            { id: "1004", unlock: 1, lv: 1, exp: 0, piece: 0 },
            { id: "1005", unlock: 1, lv: 1, exp: 0, piece: 0 },
            { id: "1006", unlock: 0, lv: 0, exp: 0, piece: 0 }
        ];
        return await this.getUnitsCollection().insertOne({ userId, units: initialUnits });
    }
}
