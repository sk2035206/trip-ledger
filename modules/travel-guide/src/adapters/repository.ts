import { parsePlan } from '../domain/plan';
import type { TripPlan } from '../domain/types';
export const STORAGE_KEY = 'travel-guide.plan.v1';
export interface PlanRepository {
    load(): TripPlan | null;
    save(plan: TripPlan): void;
}
export function localRepository(storage: Pick<Storage, 'getItem' | 'setItem'>): PlanRepository {
    return {
        load() { const text = storage.getItem(STORAGE_KEY); return text ? parsePlan(JSON.parse(text)) : null; },
        save(plan) { storage.setItem(STORAGE_KEY, JSON.stringify(parsePlan(plan))); }
    };
}
