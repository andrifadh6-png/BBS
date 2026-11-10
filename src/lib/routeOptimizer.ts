import type {Order, TravelModeOption} from '../types';
import {getOrderDestinationTarget, type LatLng} from './geo';

export interface StopLegEstimate {
  stopId: string;
  distanceMeters: number | null;
  durationMillis: number | null;
}

export interface OptimizedRouteResult {
  orderedStopIds: string[];
  routableCount: number;
  unroutableCount: number;
  totalDistanceMeters: number;
  totalDurationMillis: number;
  legs: StopLegEstimate[];
}

interface RoutableStop {
  stop: Order;
  target: LatLng | string;
}

interface MatrixCell {
  distanceMeters: number;
  durationMillis: number | null;
}

function readMatrixCell(
  matrix: google.maps.routes.RouteMatrix,
  rowIdx: number,
  colIdx: number
): MatrixCell | null {
  const item = matrix.rows?.[rowIdx]?.items?.[colIdx];
  if (!item) return null;
  if (item.condition === 'ROUTE_NOT_FOUND') return null;
  if (typeof item.distanceMeters !== 'number' || !Number.isFinite(item.distanceMeters)) {
    return null;
  }
  const durationMillis =
    typeof item.durationMillis === 'number' && Number.isFinite(item.durationMillis)
      ? item.durationMillis
      : null;
  return {
    distanceMeters: item.distanceMeters,
    durationMillis,
  };
}

function compareCells(a: MatrixCell, b: MatrixCell): number {
  if (a.distanceMeters !== b.distanceMeters) {
    return a.distanceMeters - b.distanceMeters;
  }
  const durA = a.durationMillis ?? Number.POSITIVE_INFINITY;
  const durB = b.durationMillis ?? Number.POSITIVE_INFINITY;
  return durA - durB;
}

export async function optimizeStopsWithRouteMatrix(params: {
  routesLib: google.maps.RoutesLibrary;
  origin: LatLng;
  stops: Order[];
  travelMode: TravelModeOption;
}): Promise<OptimizedRouteResult> {
  const {routesLib, origin, stops, travelMode} = params;

  const routable: RoutableStop[] = [];
  const unroutable: Order[] = [];

  for (const stop of stops) {
    const target = getOrderDestinationTarget(stop);
    if (target) {
      routable.push({stop, target});
    } else {
      unroutable.push(stop);
    }
  }

  if (routable.length === 0) {
    throw new Error('Tujuan aktif belum memiliki alamat atau koordinat yang valid.');
  }

  const sdkTravelMode =
    travelMode === 'TWO_WHEELER'
      ? routesLib.TravelMode.TWO_WHEELER
      : routesLib.TravelMode.DRIVING;

  const stringTargetsCount = routable.filter((r) => typeof r.target === 'string').length;

  // Use a full (1 + N) x (1 + N) pairwise RouteMatrix when within API element & string limits
  // (max 625 elements, max 50 string/Place waypoints across origins + destinations).
  if (routable.length <= 20 && stringTargetsCount * 2 <= 50) {
    const waypoints: Array<LatLng | string> = [origin, ...routable.map((r) => r.target)];

    const {matrix} = await routesLib.RouteMatrix.computeRouteMatrix({
      origins: waypoints,
      destinations: waypoints,
      travelMode: sdkTravelMode,
      fields: ['distanceMeters', 'durationMillis', 'condition'],
      internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    });

    const visited = new Set<number>([0]);
    let currentIdx = 0;
    const orderedRoutable: RoutableStop[] = [];
    const legs: StopLegEstimate[] = [];
    let totalDistanceMeters = 0;
    let totalDurationMillis = 0;

    while (orderedRoutable.length < routable.length) {
      let bestIdx = -1;
      let bestCell: MatrixCell | null = null;

      for (let candidateIdx = 1; candidateIdx <= routable.length; candidateIdx++) {
        if (visited.has(candidateIdx)) continue;
        const cell = readMatrixCell(matrix, currentIdx, candidateIdx);
        if (!cell) continue;
        if (!bestCell || compareCells(cell, bestCell) < 0) {
          bestIdx = candidateIdx;
          bestCell = cell;
        }
      }

      // Fallback: if no direct leg from currentIdx is routable, try distance from origin (row 0)
      if (bestIdx === -1 && currentIdx !== 0) {
        for (let candidateIdx = 1; candidateIdx <= routable.length; candidateIdx++) {
          if (visited.has(candidateIdx)) continue;
          const cell = readMatrixCell(matrix, 0, candidateIdx);
          if (!cell) continue;
          if (!bestCell || compareCells(cell, bestCell) < 0) {
            bestIdx = candidateIdx;
            bestCell = cell;
          }
        }
      }

      // Final fallback: append remaining unroutable stops in relative order
      if (bestIdx === -1) {
        for (let candidateIdx = 1; candidateIdx <= routable.length; candidateIdx++) {
          if (visited.has(candidateIdx)) continue;
          visited.add(candidateIdx);
          const item = routable[candidateIdx - 1];
          orderedRoutable.push(item);
          legs.push({stopId: item.stop.id, distanceMeters: null, durationMillis: null});
        }
        break;
      }

      visited.add(bestIdx);
      const chosen = routable[bestIdx - 1];
      orderedRoutable.push(chosen);

      const dist = bestCell?.distanceMeters ?? null;
      const dur = bestCell?.durationMillis ?? null;
      if (dist != null) totalDistanceMeters += dist;
      if (dur != null) totalDurationMillis += dur;

      legs.push({
        stopId: chosen.stop.id,
        distanceMeters: dist,
        durationMillis: dur,
      });
      currentIdx = bestIdx;
    }

    return {
      orderedStopIds: [
        ...orderedRoutable.map((r) => r.stop.id),
        ...unroutable.map((s) => s.id),
      ],
      routableCount: orderedRoutable.length,
      unroutableCount: unroutable.length,
      totalDistanceMeters,
      totalDurationMillis,
      legs,
    };
  }

  // Fallback for >20 stops or >25 string addresses: 1 x N matrix from current origin
  const batchSize = 25;
  const fromOrigin: Array<{item: RoutableStop; cell: MatrixCell | null; originalIndex: number}> = [];

  for (let start = 0; start < routable.length; start += batchSize) {
    const chunk = routable.slice(start, start + batchSize);
    const {matrix} = await routesLib.RouteMatrix.computeRouteMatrix({
      origins: [origin],
      destinations: chunk.map((c) => c.target),
      travelMode: sdkTravelMode,
      fields: ['distanceMeters', 'durationMillis', 'condition'],
      internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    });

    chunk.forEach((item, offset) => {
      fromOrigin.push({
        item,
        cell: readMatrixCell(matrix, 0, offset),
        originalIndex: start + offset,
      });
    });
  }

  fromOrigin.sort((a, b) => {
    if (a.cell && b.cell) return compareCells(a.cell, b.cell);
    if (a.cell) return -1;
    if (b.cell) return 1;
    return a.originalIndex - b.originalIndex;
  });

  let totalDistanceMeters = 0;
  let totalDurationMillis = 0;
  const legs: StopLegEstimate[] = fromOrigin.map((entry) => {
    const dist = entry.cell?.distanceMeters ?? null;
    const dur = entry.cell?.durationMillis ?? null;
    if (dist != null) totalDistanceMeters += dist;
    if (dur != null) totalDurationMillis += dur;
    return {
      stopId: entry.item.stop.id,
      distanceMeters: dist,
      durationMillis: dur,
    };
  });

  return {
    orderedStopIds: [
      ...fromOrigin.map((e) => e.item.stop.id),
      ...unroutable.map((s) => s.id),
    ],
    routableCount: fromOrigin.length,
    unroutableCount: unroutable.length,
    totalDistanceMeters,
    totalDurationMillis,
    legs,
  };
}
