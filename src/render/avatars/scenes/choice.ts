import type { SceneCtx } from '../registry';
import { placeholderScene } from './_placeholder';

// TODO: bespoke scene — delegates to the shared composed placeholder for now.
export const scene = (ctx: SceneCtx): string => placeholderScene(ctx);
