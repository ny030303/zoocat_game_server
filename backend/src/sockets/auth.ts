import { Db } from 'mongodb';
import { getDb } from '../db/db';

export interface UserProfile {
    user_id: string;
    username: string;
    level: number;
    experience: number;
    friends: string[];
    country: string;
    language: string;
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

export async function registerUser(userData: UserRegistration): Promise<{ message: string; userProfile: UserProfile }> {
    const db: Db = getDb();
    const usersCollection = db.collection('users');

    const userExists = await usersCollection.findOne({ username: userData.userName });
    if (userExists) {
        throw new Error('User already exists');
    }

    const newUserProfile: UserProfile = {
        user_id: new Date().getTime().toString(), // Or use an ObjectId in MongoDB
        username: userData.userName,
        level: 1,
        experience: 0,
        friends: [],
        country: "",
        language: "ko"
    };

    await usersCollection.insertOne({ ...userData, profile: newUserProfile });

    return { message: 'User registered successfully', userProfile: newUserProfile };
}

export async function authenticateUser(credentials: UserCredentials): Promise<UserProfile | null> {
    const db: Db = getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ user_id: credentials.id});
    if (!user) {
        return null;
    }

    return user.profile as UserProfile;
}
