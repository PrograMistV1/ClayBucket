import {system} from "@minecraft/server";
import {BucketComponent} from "./BucketComponent";
import {core} from "@bedrock-core/server";

core.register({
        creator: 'programistv1',
        pack: 'claybucket',
        packName: 'ClayBucket',
        version: '1.0.3'
    }
);

system.beforeEvents.startup.subscribe((event) => {
    event.itemComponentRegistry.registerCustomComponent("claybucket:bucket", new BucketComponent());
});