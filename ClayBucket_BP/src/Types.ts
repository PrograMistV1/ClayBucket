import {Block, Container, Entity, ItemStack} from "@minecraft/server";

export type BucketType = "empty" | "water" | "lava" | "powder_snow";

export interface BucketConfig {
    type: BucketType;
}

export interface ItemContext {
    container: Container;
    item: ItemStack | undefined;
    slot: number;
    source: Entity | Block;
}

export interface LiquidSource {
    fillSound: string;
    filledBucketId: string;

    canFill(block: Block): boolean;

    onFill(block: Block): void;
}

export interface LiquidTarget {
    emptySound: string;
    bucketType: BucketType;

    canEmpty(block: Block): boolean;

    onEmpty(block: Block): void;
}

export const FILLED_BUCKET_IDS: Record<Exclude<BucketType, "empty">, string> = {
    water: "claybucket:water_clay_bucket",
    lava: "claybucket:lava_clay_bucket",
    powder_snow: "claybucket:powder_snow_clay_bucket",
};