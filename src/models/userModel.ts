export interface UserProfile {
    id: string;
    username: string;
    level: number;
    experience: number;
    friends: string[];
    country: string;
    language: string;
    selectedUnits: string[];
    gold: number;
    gems: number;
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
