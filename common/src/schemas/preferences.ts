import { z } from 'zod'

import { CAPS } from '../caps'

/**
 * The account-following preferences, enumerated rather than open: device-shaped
 * values (window sizes, last-opened tab) stay in localStorage. Unknown keys are
 * stripped by zod, so a newer client's key is dropped rather than rejected.
 */
export const preferencesSchema = z.object({
  showSatisfactionBreakdowns: z.boolean().optional(),
  buildingGroupTutorialOpened: z.boolean().optional(),
  'dismissed-introduction': z.boolean().optional(),
  summaryHidden: z.boolean().optional(),
  shortageJumpToFactory: z.boolean().optional(),
  statisticsHidden: z.boolean().optional(),
  statisticsProductsHidden: z.boolean().optional(),
  statisticsSurplusHidden: z.boolean().optional(),
  statisticsBuildingSummaryHidden: z.boolean().optional(),
  statisticsRawResourcesHidden: z.boolean().optional(),
  statisticsShardsSloopsHidden: z.boolean().optional(),
  /** The user's recent custom group colours, newest first. */
  factoryGroupCustomColors: z.array(z.string().max(CAPS.groupColor)).max(12).optional(),
})

export type SyncedPreferences = z.infer<typeof preferencesSchema>

export const PREFERENCE_KEYS = Object.keys(preferencesSchema.shape) as (keyof SyncedPreferences)[]

export const parsePreferences = (input: unknown) => preferencesSchema.safeParse(input)
