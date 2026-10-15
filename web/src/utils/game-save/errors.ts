/** Why a file could not be read, in words a player can act on. */
export type SaveProblem = 'notASave' | 'damaged' | 'unsupported' | 'noRecipes'

export const SAVE_PROBLEM_REASONS: Record<SaveProblem, string> = {
  notASave: 'It is not a Satisfactory save file.',
  damaged: 'It is damaged or incomplete, so part of it could not be read.',
  unsupported: 'It is laid out in a way the planner cannot read, which usually means it came from a different version of Satisfactory. The planner reads saves from version 1.2.',
  noRecipes: 'The planner could not find the list of unlocked recipes in it.',
}

/** Raised whenever a file does not look like a save we can read, including a truncated one. */
export class SaveFormatError extends Error {
  constructor (message: string, readonly problem: SaveProblem = 'damaged') {
    super(message)
    this.name = 'SaveFormatError'
  }
}

// Anything else that breaks mid-read (a corrupt zlib stream throws a TypeError) is damage too.
export const saveProblemOf = (error: unknown): SaveProblem =>
  error instanceof SaveFormatError ? error.problem : 'damaged'
