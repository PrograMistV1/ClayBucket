import {
    Block,
    Container,
    CustomComponentParameters,
    Direction,
    Entity,
    GameMode,
    ItemComponentUseOnEvent,
    ItemCustomComponent,
    ItemStack,
    Player
} from "@minecraft/server";

type BucketType = "empty" | "water" | "lava" | "powder_snow";

interface BucketConfig {
    type: BucketType;
}

interface ItemContext {
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

const ADJACENT_FACE: Record<Direction, (b: Block) => Block | undefined> = {
    [Direction.Down]: b => b.below(),
    [Direction.Up]: b => b.above(),
    [Direction.North]: b => b.north(),
    [Direction.East]: b => b.east(),
    [Direction.South]: b => b.south(),
    [Direction.West]: b => b.west(),
};

const WATER_SOURCE: LiquidSource = {
    canFill: block => block.typeId === "minecraft:water",
    onFill: block => block.setType("minecraft:air"),
    fillSound: "bucket.fill_water",
    filledBucketId: "claybucket:water_clay_bucket",
};

const CAULDRON_WATER_SOURCE: LiquidSource = {
    canFill: block => {
        if (block.typeId !== "minecraft:cauldron") return false;
        if (block.permutation.getState("cauldron_liquid") !== "water") return false;
        const level = block.permutation.getState("fill_level") as number;
        return level === 6;
    },
    onFill: block => block.setType("minecraft:cauldron"),
    fillSound: "bucket.fill_water",
    filledBucketId: "claybucket:water_clay_bucket",
};

const WATER_TARGET: LiquidTarget = {
    canEmpty: block => block.isAir || block.typeId === "minecraft:water",
    onEmpty: block => block.setType("minecraft:water"),
    emptySound: "bucket.empty_water",
    bucketType: "water",
};

const CAULDRON_TARGET: LiquidTarget = {
    canEmpty: block => {
        if (block.typeId !== "minecraft:cauldron") return false;
        return block.permutation.getState("cauldron_liquid") === "water";
    },
    onEmpty: block => block.setPermutation(block.permutation.withState("fill_level", 6)),
    emptySound: "bucket.empty_water",
    bucketType: "water",
};

export class BucketComponent implements ItemCustomComponent {
    private readonly liquidSources: LiquidSource[];
    private readonly liquidTargets: LiquidTarget[];

    constructor() {
        this.liquidSources = [WATER_SOURCE, CAULDRON_WATER_SOURCE];
        this.liquidTargets = [WATER_TARGET, CAULDRON_TARGET];
    }

    onUseOn = (event: ItemComponentUseOnEvent, param: CustomComponentParameters): void => {
        const config = param.params as BucketConfig;
        const player = event.source as Player;
        const itemCtx = this.getSelectedItemContext(player);
        if (!itemCtx) return;

        if (config.type === "empty") {
            const targetBlock = this.resolveAdjacentBlock(event.block, event.blockFace);
            if (!targetBlock) return;
            this.handleFill(player, itemCtx, targetBlock);
        } else {
            const targetBlock = this.resolveEmptyTarget(event.block, event.blockFace, config.type);
            if (!targetBlock) return;
            this.handleEmpty(config.type, player, itemCtx, targetBlock);
        }
    };

    private handleFill(player: Player, itemCtx: ItemContext, targetBlock: Block): void {
        const source = this.liquidSources.find(s => s.canFill(targetBlock));
        if (!source) return;

        this.consumeItem(itemCtx);
        this.tryAddItem(player, new ItemStack(source.filledBucketId), itemCtx.container, itemCtx.slot);
        targetBlock.dimension.playSound(source.fillSound, targetBlock.center());
        source.onFill(targetBlock);
    }

    private handleEmpty(
        bucketType: BucketType,
        player: Player,
        itemCtx: ItemContext,
        targetBlock: Block
    ): void {
        const liquidTarget = this.liquidTargets.find(t => t.bucketType === bucketType && t.canEmpty(targetBlock));
        if (!liquidTarget) return;

        this.consumeItem(itemCtx);
        targetBlock.dimension.playSound(liquidTarget.emptySound, targetBlock.center());
        player.dimension.playSound("random.break", player.location, {volume: 1.0, pitch: 0.9});
        liquidTarget.onEmpty(targetBlock);
    }

    private resolveAdjacentBlock(block: Block, face: Direction): Block | undefined {
        if (block.typeId === "minecraft:powder_snow") return block;
        if (block.typeId === "minecraft:cauldron") return block;
        return ADJACENT_FACE[face]?.(block);
    }

    private resolveEmptyTarget(block: Block, face: Direction, bucketType: BucketType): Block | undefined {
        if (block.typeId === "minecraft:cauldron") return block;
        const adjacent = ADJACENT_FACE[face]?.(block);
        if (!adjacent) return undefined;

        const matchingTarget = this.liquidTargets.find(t => t.bucketType === bucketType);
        return matchingTarget?.canEmpty(adjacent) ? adjacent : undefined;
    }

    private consumeItem(itemCtx: ItemContext, amount: number = 1): void {
        if (this.isCreative(itemCtx.source)) return;
        if (!itemCtx.item) return;

        const newAmount = itemCtx.item.amount - amount;
        if (newAmount > 0) {
            itemCtx.item.amount = newAmount;
            itemCtx.container.setItem(itemCtx.slot, itemCtx.item);
        } else {
            itemCtx.container.setItem(itemCtx.slot, null);
        }
    }

    private tryAddItem(source: Player, item: ItemStack, container: Container, slot: number): void {
        if (this.isCreative(source)) return;

        if (!container.getItem(slot)) {
            container.setItem(slot, item);
        } else {
            const dropped = container.addItem(item);
            if (dropped) {
                source.dimension.spawnItem(item, source.location);
                source.dimension.playSound("random.pop", source.location);
            }
        }
    }

    private isCreative(source: Entity | Block): boolean {
        return source instanceof Player && source.getGameMode() === GameMode.Creative;
    }

    private getSelectedItemContext(player: Player): ItemContext | null {
        return this.getItemContext(player, player.selectedSlotIndex);
    }

    private getItemContext(source: Entity | Block, slot: number): ItemContext | null {
        const container = (source as Entity).getComponent("minecraft:inventory")?.container;
        if (!container) return null;
        return {container, item: container.getItem(slot), slot, source};
    }
}