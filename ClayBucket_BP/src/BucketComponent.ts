import {
    Block,
    ButtonState,
    Container,
    CustomComponentParameters,
    Direction,
    Entity,
    GameMode,
    InputButton,
    ItemComponentUseOnEvent,
    ItemCustomComponent,
    ItemStack,
    LiquidType,
    Player,
    PlayerInteractWithBlockAfterEvent,
    ScriptEventCommandMessageAfterEvent,
    system,
    world
} from "@minecraft/server";
import {CAULDRON_LIQUID_SOURCES, CAULDRON_LIQUID_TARGETS, LIQUID_SOURCES, LIQUID_TARGETS} from "./Liquids";
import {BucketConfig, BucketType, FILLED_BUCKET_IDS, ItemContext, LiquidSource, LiquidTarget} from "./Types";

const ADJACENT_FACE: Record<Direction, (b: Block) => Block | undefined> = {
    [Direction.Down]: b => b.below(),
    [Direction.Up]: b => b.above(),
    [Direction.North]: b => b.north(),
    [Direction.East]: b => b.east(),
    [Direction.South]: b => b.south(),
    [Direction.West]: b => b.west(),
};

const BARREL_BUCKET_TYPES = new Set<BucketType>(["water", "lava", "empty"]);

type PendingBarrelFill = {
    resolve: (state: { input: string; filling: number; isBarrel: boolean }) => void;
};

export class BucketComponent implements ItemCustomComponent {
    private static readonly BARREL_RESPONSE_TIMEOUT_TICKS = 20; // 1 second - abandon the request if ExNihilo never answers
    private pendingBarrelRequests = new Map<string, PendingBarrelFill>();
    private barrelRequestCounter = 0;

    constructor() {
        system.afterEvents.scriptEventReceive.subscribe(this.handleScriptEvent.bind(this), {namespaces: ["claybucket"]});
        system.afterEvents.scriptEventReceive.subscribe(this.handleBarrelStateResponse.bind(this), {namespaces: ["exnihilo"]});
        world.afterEvents.playerInteractWithBlock.subscribe(this.handlePlayerInteractWithBlock.bind(this));
    }

    onUseOn = (e: ItemComponentUseOnEvent, p: CustomComponentParameters): void => {
        if (!(e.source instanceof Player)) return;

        const config = p.params as BucketConfig;
        const itemCtx = this.getSelectedItemContext(e.source);
        if (!itemCtx) return;

        if (e.block.getComponent("exnihilo:barrel") && BARREL_BUCKET_TYPES.has(config.type)) {
            this.handleBarrelInteraction(config.type, e.source, itemCtx, e.block);
            return;
        }

        if (config.type === "empty") {
            let targetBlock = e.source.getBlockFromViewDirection({maxDistance: 6, includeLiquidBlocks: true})?.block;
            if (!targetBlock) return;
            if (!targetBlock.isLiquid || targetBlock.permutation.getState("liquid_depth") !== 0) {
                targetBlock = this.resolveAdjacentBlock(e.block, e.blockFace);
            }
            this.handleFill(e.source, itemCtx, targetBlock, LIQUID_SOURCES);
        } else {
            const targetBlock = this.resolveEmptyTarget(e.block, e.blockFace, config.type);
            if (!targetBlock) return;
            this.handleEmpty(config.type, e.source, itemCtx, targetBlock, LIQUID_TARGETS);
        }
    }

    private handlePlayerInteractWithBlock(e: PlayerInteractWithBlockAfterEvent): void {
        if (e.player.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed) return;

        const itemCtx = this.getSelectedItemContext(e.player);
        if (!itemCtx?.item) return;

        const component = itemCtx.item.getComponent("claybucket:bucket");
        if (!component) return;

        const config = component.customComponentParameters.params as BucketConfig;

        if (e.block.getComponent("exnihilo:barrel") && BARREL_BUCKET_TYPES.has(config.type)) {
            this.handleBarrelInteraction(config.type, e.player, itemCtx, e.block);
            return;
        }

        if (e.block.typeId !== "minecraft:cauldron") return;

        if (config.type === "empty") {
            this.handleFill(e.player, itemCtx, e.block, CAULDRON_LIQUID_SOURCES);
        } else {
            this.handleEmpty(config.type, e.player, itemCtx, e.block, CAULDRON_LIQUID_TARGETS);
        }
    }

    // --- Barrel (ExNihilo) integration ---------------------------------------------------

    private handleBarrelInteraction(
        bucketType: BucketType,
        player: Player,
        itemCtx: ItemContext,
        barrelBlock: Block
    ): void {
        if (bucketType === "empty") {
            this.tryFillFromBarrel(player, itemCtx, barrelBlock);
        } else {
            this.tryEmptyIntoBarrel(bucketType, player, itemCtx, barrelBlock);
        }
    }

    /** Empty bucket + barrel of water/lava at 100% -> filled bucket, barrel is cleared. */
    private tryFillFromBarrel(player: Player, itemCtx: ItemContext, barrelBlock: Block): void {
        this.requestBarrelState(barrelBlock).then(state => {
            if (!state.isBarrel) return;
            if (state.input !== "exnihilo:water" && state.input !== "exnihilo:lava") return;
            if (state.filling < 100) return;

            const filledBucketId = state.input === "exnihilo:water" ? FILLED_BUCKET_IDS["water"] : FILLED_BUCKET_IDS["lava"];
            const fillSound = state.input === "exnihilo:water" ? "bucket.fill_water" : "bucket.fill_lava";

            this.consumeItem(itemCtx);
            this.tryAddItem(player, new ItemStack(filledBucketId), itemCtx.container, itemCtx.slot);
            barrelBlock.dimension.playSound(fillSound, {...player.location, y: player.location.y + 0.5});

            this.sendBarrelCommand(barrelBlock, "exnihilo:barrel_empty", {
                dimension: barrelBlock.dimension.id,
                x: barrelBlock.x,
                y: barrelBlock.y,
                z: barrelBlock.z
            });
        });
    }

    /** Filled water/lava bucket -> barrel is empty or already holds the same liquid/ */
    private tryEmptyIntoBarrel(bucketType: Exclude<BucketType, "empty">, player: Player, itemCtx: ItemContext, barrelBlock: Block): void {
        this.requestBarrelState(barrelBlock).then(state => {
            if (!state.isBarrel) return;

            const targetInput = bucketType === "water" ? "exnihilo:water" : "exnihilo:lava";
            const canEmpty = state.input === "exnihilo:default" || state.input === targetInput;
            if (!canEmpty) return;

            const emptySound = bucketType === "water" ? "bucket.empty_water" : "bucket.empty_lava";

            this.consumeItem(itemCtx);
            barrelBlock.dimension.playSound(emptySound, {...player.location, y: player.location.y + 0.5});
            if (!this.isCreative(player)) {
                player.dimension.playSound("random.break", player.location, {volume: 1.0, pitch: 0.9});
            }

            this.sendBarrelCommand(barrelBlock, "exnihilo:barrel_set", {
                dimension: barrelBlock.dimension.id,
                x: barrelBlock.x,
                y: barrelBlock.y,
                z: barrelBlock.z,
                input: targetInput,
                filling: 100
            });
        });
    }

    private requestBarrelState(barrelBlock: Block): Promise<{ input: string; filling: number; isBarrel: boolean }> {
        return new Promise(resolve => {
            const responseId = `req_${this.barrelRequestCounter++}_${system.currentTick}`;
            this.pendingBarrelRequests.set(responseId, {resolve});

            this.sendBarrelCommand(barrelBlock, "exnihilo:barrel_get", {
                dimension: barrelBlock.dimension.id,
                x: barrelBlock.x,
                y: barrelBlock.y,
                z: barrelBlock.z,
                responseId
            });

            system.runTimeout(() => {
                if (!this.pendingBarrelRequests.has(responseId)) return;
                this.pendingBarrelRequests.delete(responseId);
                resolve({input: "exnihilo:default", filling: 0, isBarrel: false});
            }, BucketComponent.BARREL_RESPONSE_TIMEOUT_TICKS);
        });
    }

    private handleBarrelStateResponse(event: ScriptEventCommandMessageAfterEvent): void {
        if (event.id !== "exnihilo:barrel_state") return;

        let payload: { responseId?: string; input: string; filling: number; isBarrel: boolean };
        try {
            payload = JSON.parse(event.message);
        } catch {
            return;
        }

        if (!payload.responseId) return;
        const pending = this.pendingBarrelRequests.get(payload.responseId);
        if (!pending) return;

        this.pendingBarrelRequests.delete(payload.responseId);
        pending.resolve({input: payload.input, filling: payload.filling, isBarrel: payload.isBarrel});
    }

    private sendBarrelCommand(block: Block, id: string, payload: Record<string, unknown>): void {
        try {
            block.dimension.runCommand(`scriptevent ${id} ${JSON.stringify(payload)}`);
        } catch (e) {
            console.warn(`[claybucket] Failed to send ${id} to barrel: ${e}`);
        }
    }

    // --------------------------------------------------------------------------------------

    private handleFill(player: Player, itemCtx: ItemContext, targetBlock: Block, sources: LiquidSource[]): void {
        const source = sources.find(s => s.canFill(targetBlock));
        if (!source) return;

        this.consumeItem(itemCtx);
        this.tryAddItem(player, new ItemStack(source.filledBucketId), itemCtx.container, itemCtx.slot);
        targetBlock.dimension.playSound(source.fillSound, {...player.location, y: player.location.y + 0.5});
        source.onFill(targetBlock);
    }

    private handleEmpty(
        bucketType: BucketType,
        player: Player,
        itemCtx: ItemContext,
        targetBlock: Block,
        targets: LiquidTarget[],
    ): void {
        const liquidTarget = targets.find(t => t.bucketType === bucketType && t.canEmpty(targetBlock));
        if (!liquidTarget) return;

        this.consumeItem(itemCtx);
        targetBlock.dimension.playSound(liquidTarget.emptySound, {...player.location, y: player.location.y + 0.5});
        if (!this.isCreative(player)) {
            player.dimension.playSound("random.break", player.location, {volume: 1.0, pitch: 0.9});
        }
        liquidTarget.onEmpty(targetBlock);
    }

    private resolveAdjacentBlock(block: Block, face: Direction): Block | undefined {
        if (block.typeId === "minecraft:powder_snow") return block;
        if (block.isLiquid) return block;
        if (block.isWaterlogged) return block;
        return ADJACENT_FACE[face]?.(block);
    }

    private resolveEmptyTarget(block: Block, face: Direction, bucketType: BucketType): Block | undefined {
        if (block.canContainLiquid(LiquidType.Water) && bucketType === "water") return block;
        const adjacent = ADJACENT_FACE[face]?.(block);
        if (!adjacent) return undefined;

        const matchingTarget = LIQUID_TARGETS.find(t => t.bucketType === bucketType);
        return matchingTarget?.canEmpty(adjacent) ? adjacent : undefined;
    }

    private consumeItem(itemCtx: ItemContext, amount: number = 1): void {
        if (this.isCreative(itemCtx.source as Player)) return;
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

    private isCreative(source: Player): boolean {
        return source.getGameMode() === GameMode.Creative;
    }

    private getSelectedItemContext(player: Player): ItemContext | null {
        return this.getItemContext(player, player.selectedSlotIndex);
    }

    private getItemContext(source: Entity | Block, slot: number): ItemContext | null {
        const container = (source as Entity).getComponent("minecraft:inventory")?.container;
        if (!container) return null;
        return {container, item: container.getItem(slot), slot, source};
    }

    private handleScriptEvent(event: ScriptEventCommandMessageAfterEvent): void {
        if (!(event.sourceEntity instanceof Player)) return;
        const player = event.sourceEntity;
        const itemCtx = this.getSelectedItemContext(player);
        if (!itemCtx?.item) return;

        if (event.id === "claybucket:fill") {
            this.handleFillEvent(player, itemCtx, event.message.trim());
        } else if (event.id === "claybucket:empty") {
            this.handleEmptyEvent(player, itemCtx);
        }
    }

    private handleFillEvent(player: Player, itemCtx: ItemContext, message: string): void {
        if (itemCtx.item.typeId !== "claybucket:clay_bucket") return;

        const bucketType = message.trim() as Exclude<BucketType, "empty">;
        const filledBucketId = FILLED_BUCKET_IDS[bucketType];
        if (!filledBucketId) {
            console.error(`Claybucket: unknown bucket type "${bucketType}". Valid types: ${Object.keys(FILLED_BUCKET_IDS).join(", ")}`);
            return;
        }

        this.consumeItem(itemCtx);
        this.tryAddItem(player, new ItemStack(filledBucketId), itemCtx.container, itemCtx.slot);
    }

    private handleEmptyEvent(player: Player, itemCtx: ItemContext): void {
        const component = itemCtx.item.getComponent("claybucket:bucket")
        if (!component || component.customComponentParameters.params["type"] === "empty") return;

        this.consumeItem(itemCtx);
        if (!this.isCreative(player)) {
            player.dimension.playSound("random.break", player.location, {volume: 1.0, pitch: 0.9});
        }
    }
}