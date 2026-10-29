import { coordinateText, routeLegs } from '../domain/plan';
import type { TripPlan, RouteLeg, RouteResult } from '../domain/types';
import { getRoute } from './api';
export type RouteFetcher = (origin: string, destination: string, mode: string, signal: AbortSignal) => Promise<RouteResult>;
export class RoutePlanner {
    private controller: AbortController | null = null;
    private cache = new Map<string, RouteResult>();
    cancel() { this.controller?.abort(); this.controller = null; }
    async generate(plan: TripPlan, dayId: string, update: (legs: RouteLeg[]) => void, fetcher: RouteFetcher = getRoute) {
        this.cancel();
        const controller = new AbortController();
        this.controller = controller;
        const legs = routeLegs(plan, dayId);
        const emit = () => { if (!controller.signal.aborted)
            update([...legs]); };
        emit();
        let index = 0;
        const worker = async () => {
            while (index < legs.length && !controller.signal.aborted) {
                const i = index++, leg = legs[i];
                if (leg.status === 'manual' || leg.status === 'missing')
                    continue;
                const origin = coordinateText(plan.places.find(p => p.id === leg.from.placeId)!), destination = coordinateText(plan.places.find(p => p.id === leg.to.placeId)!);
                const key = `${origin}:${destination}:${leg.mode}`;
                try {
                    let result = this.cache.get(key);
                    if (!result) {
                        result = await fetcher(origin, destination, leg.mode, controller.signal);
                        if (controller.signal.aborted)
                            return;
                        if (this.cache.size >= 200)
                            this.cache.clear();
                        this.cache.set(key, result);
                    }
                    legs[i] = { ...leg, status: 'success', result, message: undefined };
                }
                catch (error) {
                    if (controller.signal.aborted)
                        return;
                    legs[i] = { ...leg, status: 'error', message: error instanceof Error ? error.message : '路线规划失败' };
                }
                emit();
            }
        };
        await Promise.all([worker(), worker()]);
        return !controller.signal.aborted;
    }
}
