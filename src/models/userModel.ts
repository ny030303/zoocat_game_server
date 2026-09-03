export interface UserProfile {
    id: string;              // 서버 생성 UUID
    username: string;
    level: number;
    experience: number;
    friends: string[];
    country: string;
    language: string;
    selectedUnits: string[];
    gold: number;
    gems: number;
    underage: boolean;       // register 시 1회 확정, 이후 불변
    providerType?: 'gpgs';   // Phase 2
    providerUserId?: string; // Phase 2
}
