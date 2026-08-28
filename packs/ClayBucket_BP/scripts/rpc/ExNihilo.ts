// --- Mirrors exnihilo's BarrelRPC / CrucibleRPC interfaces -----------------------------
// Ideally imported from a shared @exnihilo/api-types package once one exists; for now the
// method names and shapes must stay in sync with exnihilo's own BarrelAPI.ts / CrucibleAPI.ts.
export const EXNIHILO_NODE_ID = "programistv1_exnihilo";

export type TilePosition = { dimension: string; x: number; y: number; z: number };

export type BarrelState = { input: string; filling: number; isBarrel: boolean };
export type CrucibleState = { input: string; filling: number; isCrucible: boolean };

export interface BarrelRPC {
    barrelSet(params: TilePosition & { input: string; filling?: number }): void;

    barrelEmpty(params: TilePosition): void;

    barrelGet(params: TilePosition): BarrelState;
}

export interface CrucibleRPC {
    crucibleSet(params: TilePosition & { input: string; filling?: number }): void;

    crucibleEmpty(params: TilePosition): void;

    crucibleGet(params: TilePosition): CrucibleState;
}