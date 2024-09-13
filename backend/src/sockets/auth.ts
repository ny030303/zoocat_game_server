import { Db } from 'mongodb';
import { getDb } from '../db/db';

export interface UserProfile {
    id: string;
    username: string;
    level: number;
    experience: number;
    friends: string[];
    country: string;
    language: string;
    selected_units: string[];
    gold: number,    // 무료 재화
    gems: number     // 유료 재화
}

export interface UserCredentials {
    id: string;
    userName: string;
    underage: string;
}

export interface UserRegistration {
    id: string;
    userName: string;
    underage: string;
}

export interface Unit {
    id: number;        // 유닛의 고유 ID
    unlock: number;    // 유닛 잠금 상태 (1 = 잠금 해제, 0 = 잠금)
    lv: number;        // 유닛 레벨
    exp: number;       // 유닛 경험치
    piece: number;     // 유닛 조각 수
}

export async function registerUser(userData: UserRegistration): Promise<{ message: string; userProfile: UserProfile }> {
    const db: Db = getDb();
    const usersCollection = db.collection('users');
    const unitsCollection = db.collection('units'); // units 컬렉션

    const userExists = await usersCollection.findOne({ username: userData.userName });
    if (userExists) {
        throw new Error('User already exists');
    }

    const { userName, ...restUserData } = userData;

    const newUserProfile: UserProfile = {
        id: userData.id,
        username: userName, // userData.userName를 사용하여 username을 설정
        level: 1,
        experience: 0,
        friends: [],
        country: "",
        language: "ko",
        selected_units: [],
        gold: 1000,    // 무료 재화
        gems: 0        // 유료 재화
    };
    // users 컬렉션에 사용자 삽입
    await usersCollection.insertOne({ ...restUserData, ...newUserProfile });

    // 기본 유닛 데이터 생성 (Unit 인터페이스를 사용)
    const initialUnits: Unit[] = [
        { id: 10001, unlock: 1, lv: 1, exp: 0, piece: 30 },
        { id: 10002, unlock: 0, lv: 0, exp: 0, piece: 20 },
        { id: 10003, unlock: 0, lv: 0, exp: 0, piece: 0 },
        { id: 10004, unlock: 0, lv: 0, exp: 0, piece: 0 },
        { id: 10005, unlock: 0, lv: 0, exp: 0, piece: 0 }
    ];

    // units 컬렉션에 해당 유저의 유닛 데이터를 삽입
    await unitsCollection.insertOne({
        user_id: userData.id,
        units: initialUnits
    });

    return { message: 'User registered successfully', userProfile: newUserProfile };
}

export async function authenticateUser(credentials: UserCredentials): Promise<UserProfile | null> {
    const db: Db = getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ id: credentials.id });
    if (!user) {
        return null;
    }

    return user as unknown as UserProfile;
}
