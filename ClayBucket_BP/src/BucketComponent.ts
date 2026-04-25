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

export class BucketComponent implements ItemCustomComponent {

    constructor() {
        system.afterEvents.scriptEventReceive.subscribe(this.handleScriptEvent.bind(this), {namespaces: ["claybucket"]});
        world.afterEvents.playerInteractWithBlock.subscribe(this.handlePlayerInteractWithBlock.bind(this));
    }

    onUseOn = (e: ItemComponentUseOnEvent, p: CustomComponentParameters): void => {
        if (!(e.source instanceof Player)) return;

        const config = p.params as BucketConfig;
        const itemCtx = this.getSelectedItemContext(e.source);
        if (!itemCtx) return;

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
        if (e.block.typeId !== "minecraft:cauldron") return;

        const itemCtx = this.getSelectedItemContext(e.player);
        if (!itemCtx?.item) return;

        const component = itemCtx.item.getComponent("claybucket:bucket");
        if (!component) return;

        const config = component.customComponentParameters.params as BucketConfig;

        if (config.type === "empty") {
            this.handleFill(e.player, itemCtx, e.block, CAULDRON_LIQUID_SOURCES);
        } else {
            this.handleEmpty(config.type, e.player, itemCtx, e.block, CAULDRON_LIQUID_TARGETS);
        }
    }

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