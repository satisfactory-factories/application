// Every row of a station view shares one column per slot: the station building, then each platform,
// so a car always sits under the platform it stops at.
export const SLOT_WIDTH = 84

export const slotGridStyle = (platforms: number) => ({
  gridTemplateColumns: `repeat(${platforms + 1}, ${SLOT_WIDTH}px)`,
})
