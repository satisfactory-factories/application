// Calculation settings that come from the user rather than the plan.
//
// This is deliberately a module-level value rather than a parameter threaded through
// calculateFactory: the engine re-enters itself from inside dependencies.ts and inputs.ts
// without passing its modes, so a threaded flag would silently revert mid-calculation.
// The app store owns the value and pushes it in; specs set it directly.

// Defaults to the historical behaviour so anything running before the store has resolved the
// user's choice (and every spec that predates this setting) is unaffected. New plans get false
// pushed in by the app store; see its first-run resolution.
let assumeRawInputs = true

// When true, any raw resource demand a factory can't meet from imports or its own extraction
// is assumed to be handled by the player. When false it is a real shortage.
export const getAssumeRawInputs = (): boolean => assumeRawInputs

export const setAssumeRawInputs = (value: boolean): void => {
  assumeRawInputs = value
}
