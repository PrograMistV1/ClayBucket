import {LiquidType} from "@minecraft/server";
import {LiquidSource, LiquidTarget} from "./Types";

// --- Sources ---

const WATER_SOURCE: LiquidSource = {
    canFill: block =>
        block.typeId === "minecraft:water" &&
        (block.permutation.getState("liquid_depth") as number) === 0,
    onFill: block => block.setType("minecraft:air"),
    fillSound: "bucket.fill_water",
    filledBucketId: "claybucket:water_clay_bucket",
};

const WATERLOGGED_SOURCE: LiquidSource = {
    canFill: block => block.isWaterlogged,
    onFill: block => block.setWaterlogged(false),
    fillSound: "bucket.fill_water",
    filledBucketId: "claybucket:water_clay_bucket",
};

const LAVA_SOURCE: LiquidSource = {
    canFill: block => block.typeId === "minecraft:lava",
    onFill: block => block.setType("minecraft:air"),
    fillSound: "bucket.fill_lava",
    filledBucketId: "claybucket:lava_clay_bucket",
};

const POWDER_SNOW_SOURCE: LiquidSource = {
    canFill: block => block.typeId === "minecraft:powder_snow",
    onFill: block => block.setType("minecraft:air"),
    fillSound: "bucket.fill_powder_snow",
    filledBucketId: "claybucket:powder_snow_clay_bucket",
};

const CAULDRON_WATER_SOURCE: LiquidSource = {
    canFill: block =>
        block.typeId === "minecraft:cauldron" &&
        block.permutation.getState("cauldron_liquid") === "water" &&
        (block.permutation.getState("fill_level") as number) === 6,
    onFill: block => block.setType("minecraft:cauldron"),
    fillSound: "cauldron.takewater",
    filledBucketId: "claybucket:water_clay_bucket",
};

const CAULDRON_LAVA_SOURCE: LiquidSource = {
    canFill: block =>
        block.typeId === "minecraft:cauldron" &&
        block.permutation.getState("cauldron_liquid") === "lava" &&
        (block.permutation.getState("fill_level") as number) === 6,
    onFill: block => block.setType("minecraft:cauldron"),
    fillSound: "bucket.fill_lava",
    filledBucketId: "claybucket:lava_clay_bucket",
};

const CAULDRON_POWDER_SNOW_SOURCE: LiquidSource = {
    canFill: block =>
        block.typeId === "minecraft:cauldron" &&
        block.permutation.getState("cauldron_liquid") === "powder_snow" &&
        (block.permutation.getState("fill_level") as number) === 6,
    onFill: block => block.setType("minecraft:cauldron"),
    fillSound: "bucket.fill_powder_snow",
    filledBucketId: "claybucket:powder_snow_clay_bucket",
};

// --- Targets ---

const WATER_TARGET: LiquidTarget = {
    canEmpty: block => block.isAir || block.isLiquid,
    onEmpty: block => block.setType("minecraft:flowing_water"),
    emptySound: "bucket.empty_water",
    bucketType: "water",
};

const WATERLOGGED_TARGET: LiquidTarget = {
    canEmpty: block => block.canContainLiquid(LiquidType.Water),
    onEmpty: block => block.setWaterlogged(true),
    emptySound: "bucket.empty_water",
    bucketType: "water",
};

const LAVA_TARGET: LiquidTarget = {
    canEmpty: block => block.isAir || block.isLiquid,
    onEmpty: block => block.setType("minecraft:flowing_lava"),
    emptySound: "bucket.empty_lava",
    bucketType: "lava",
};

const POWDER_SNOW_TARGET: LiquidTarget = {
    canEmpty: block => block.isAir || block.isLiquid,
    onEmpty: block => block.setType("minecraft:powder_snow"),
    emptySound: "bucket.empty_powder_snow",
    bucketType: "powder_snow",
};

const CAULDRON_WATER_TARGET: LiquidTarget = {
    canEmpty: block =>
        block.typeId === "minecraft:cauldron" &&
        block.permutation.getState("cauldron_liquid") === "water",
    onEmpty: block => block.setPermutation(block.permutation.withState("fill_level", 6)),
    emptySound: "cauldron.fillwater",
    bucketType: "water",
};

const CAULDRON_LAVA_TARGET: LiquidTarget = {
    canEmpty: block =>
        block.typeId === "minecraft:cauldron" && (
            block.permutation.getState("cauldron_liquid") === "lava" ||
            block.permutation.getState("fill_level") === 0
        ),
    onEmpty: block => {
        block.setPermutation(block.permutation.withState("cauldron_liquid", "lava"));
        block.setPermutation(block.permutation.withState("fill_level", 6));
    },
    emptySound: "bucket.empty_lava",
    bucketType: "lava",
};

const CAULDRON_POWDER_SNOW_TARGET: LiquidTarget = {
    canEmpty: block =>
        block.typeId === "minecraft:cauldron" && (
            block.permutation.getState("cauldron_liquid") === "powder_snow" ||
            block.permutation.getState("fill_level") === 0
        ),
    onEmpty: block => {
        block.setPermutation(block.permutation.withState("cauldron_liquid", "powder_snow"));
        block.setPermutation(block.permutation.withState("fill_level", 6));
    },
    emptySound: "bucket.empty_powder_snow",
    bucketType: "powder_snow",
};

// --- Exports ---

export const LIQUID_SOURCES: LiquidSource[] = [
    WATER_SOURCE,
    WATERLOGGED_SOURCE,
    LAVA_SOURCE,
    POWDER_SNOW_SOURCE,
];

export const LIQUID_TARGETS: LiquidTarget[] = [
    WATER_TARGET,
    WATERLOGGED_TARGET,
    LAVA_TARGET,
    POWDER_SNOW_TARGET,
];

export const CAULDRON_LIQUID_SOURCES: LiquidSource[] = [
    CAULDRON_WATER_SOURCE,
    CAULDRON_LAVA_SOURCE,
    CAULDRON_POWDER_SNOW_SOURCE
];

export const CAULDRON_LIQUID_TARGETS: LiquidTarget[] = [
    CAULDRON_WATER_TARGET,
    CAULDRON_LAVA_TARGET,
    CAULDRON_POWDER_SNOW_TARGET
];