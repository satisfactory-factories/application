// Calculation settings that come from outside the factory being calculated.
//
// This is deliberately a module-level value rather than a parameter threaded through
// calculateFactory: the engine re-enters itself from inside dependencies.ts and inputs.ts
// without passing its modes, so a threaded flag would silently revert mid-calculation.
// The app store owns the value and pushes it in; specs set it directly.

// Defaults to the historical behaviour so anything running before the store has resolved the
// plan's default (and every spec that predates this setting) is unaffected. The value belongs
// to the plan, not the browser — see resolvePlanAssumption in the app store.
let assumeRawInputs = true

// When true, any raw resource demand a factory can't meet from imports or its own extraction
// is assumed to be handled by the player. When false it is a real shortage.
export const getAssumeRawInputs = (): boolean => assumeRawInputs

export const setAssumeRawInputs = (value: boolean): void => {
  assumeRawInputs = value
}
