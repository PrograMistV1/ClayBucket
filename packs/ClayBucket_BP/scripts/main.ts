import {system} from "@minecraft/server";
import {BucketComponent} from "./BucketComponent";

system.beforeEvents.startup.subscribe((event) => {
    event.itemComponentRegistry.registerCustomComponent("claybucket:bucket", new BucketComponent());
});