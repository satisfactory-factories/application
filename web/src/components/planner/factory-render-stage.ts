import type { InjectionKey, Ref } from 'vue'

/**
 * How much of a factory card has mounted, provided by PlannerFactory to its sections. The
 * planner fades a factory in once the top of it is ready and mounts the rest a stage per frame
 * after the fade, so a big factory never blocks the fade on one long task.
 *
 * 0: the header, the checklist and the first product rows. 1: every product. 2: imports.
 * 3: satisfaction. 4: tasks and notes.
 */
export const FACTORY_RENDER_STAGE: InjectionKey<Ref<number>> = Symbol('factoryRenderStage')

export const LAST_FACTORY_RENDER_STAGE = 4

/** Product rows mounted before the fade-in: enough to fill the top of the card. */
export const FIRST_PRODUCT_ROWS = 3
