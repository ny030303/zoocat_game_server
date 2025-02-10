import { UnitRepository } from '../repositories/unitRepository';

export async function getUserUnits(userId: string) {
    return await UnitRepository.getUnitsByUserId(userId);
}
