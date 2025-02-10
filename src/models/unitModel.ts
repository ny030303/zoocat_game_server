export interface Unit {
    id: string;
    unlock: number;
    lv: number;
    exp: number;
    piece: number;
}

export interface getUserUnitsDTO {
    userId: string;
}
