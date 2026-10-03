import { Injectable } from '@nestjs/common'

/**
 * Every individually-idempotent write a room mutation is made of. Standalone
 * mongod has no transactions, so a mutation is a chain of these and a retry
 * resumes at the incomplete one. Naming them gives the tests a seam: override
 * the runner to throw at one step and the partial state is reproducible.
 */
export type EnsureStep =
  | 'ensure-room'
  | 'ensure-membership'
  | 'bump-rooms-revision'
  | 'record-activity'
  | 'stamp-legacy-import'
  | 'tombstone-room'
  | 'remove-memberships'
  | 'remove-membership'
  | 'update-room-meta'
  | 'reorder-memberships'

@Injectable()
export class EnsureStepRunner {
  async run<T> (_step: EnsureStep, work: () => Promise<T>): Promise<T> {
    return work()
  }
}
