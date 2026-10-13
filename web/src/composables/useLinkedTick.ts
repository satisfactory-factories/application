// The linked-tick offer: after either end of a link is ticked or unticked, offer to do the same to
// the other end. Ticking an export offers the import it feeds on the destination; ticking an
// import offers the export it draws on at the source. See linkedImportTickOffer and
// linkedExportTickOffer in checklist.ts for the rules.
//
// The ticks are drawn in several places (the Satisfaction export chips, the Imports table and the
// Checklist panel), and the offer is one dialog mounted once by the planner, so the pending offer
// lives here at module scope where both the ticks and the dialog can reach it.
import { ref } from 'vue'
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import {
  applyLinkedExportTick,
  applyLinkedImportTick,
  isChecklistExportComplete,
  linkedExportTickOffer,
  linkedImportTickOffer,
  LinkedTickChoice,
  LinkedTickOffer,
  toggleChecklistExport,
  toggleChecklistInput,
} from '@/utils/factory-management/checklist'

export interface PendingLinkedTick {
  // Which end the offer would change: 'import' after an export was ticked, 'export' after an
  // import was ticked.
  target: 'import' | 'export'
  // The link itself, the same whichever end was ticked.
  sourceFactoryId: number
  destinationFactoryId: number
  part: string
  offer: LinkedTickOffer
}

const pending = ref<PendingLinkedTick | null>(null)

// The factory the offer would change.
export const linkedTickTargetId = (offer: PendingLinkedTick): number =>
  offer.target === 'import' ? offer.destinationFactoryId : offer.sourceFactoryId

// Toggles the export exactly as toggleChecklistExport does, then raises the offer if the tick
// actually flipped. A click that only re-confirms a desynced amount leaves the tick where it was,
// and has nothing to say about the other end. `destination` is undefined when the requesting
// factory cannot be found (a dangling request mid-delete), in which case there is nothing to offer.
export const toggleChecklistExportWithOffer = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string,
  amount: number,
  destination: Factory | undefined
): void => {
  const before = isChecklistExportComplete(factory, requestingFactoryId, part)
  toggleChecklistExport(factory, requestingFactoryId, part, amount)
  const after = isChecklistExportComplete(factory, requestingFactoryId, part)
  if (before === after || !destination) return

  const offer = linkedImportTickOffer(destination, factory.id, part, after)
  pending.value = offer
    ? { target: 'import', sourceFactoryId: factory.id, destinationFactoryId: destination.id, part, offer }
    : null
}

// Offers the source's export to match an import row's tick. Shared by a direct tick of the row and
// by pointing an already ticked row at a new source.
export const offerLinkedExportTick = (factory: Factory, input: FactoryInput, source: Factory | undefined): void => {
  if (!source || !input.outputPart) return
  const offer = linkedExportTickOffer(source, factory.id, input.outputPart, !!input.completed)
  pending.value = offer
    ? { target: 'export', sourceFactoryId: source.id, destinationFactoryId: factory.id, part: input.outputPart, offer }
    : null
}

// The import-side twin of toggleChecklistExportWithOffer.
export const toggleChecklistInputWithOffer = (
  factory: Factory,
  input: FactoryInput,
  source: Factory | undefined
): void => {
  const before = !!input.completed
  toggleChecklistInput(factory, input)
  if (before === !!input.completed) return
  offerLinkedExportTick(factory, input, source)
}

export const useLinkedTick = () => {
  const confirm = (target: Factory | undefined, choice: LinkedTickChoice) => {
    const current = pending.value
    pending.value = null
    if (!current || !target || target.id !== linkedTickTargetId(current)) return
    const resolved = {
      tick: choice.tick && current.offer.count > 0,
      enableChecklist: choice.enableChecklist && current.offer.offerEnableChecklist,
    }
    if (current.target === 'import') {
      applyLinkedImportTick(target, current.sourceFactoryId, current.part, current.offer.completed, resolved)
    } else {
      applyLinkedExportTick(target, current.destinationFactoryId, current.part, current.offer.completed, resolved)
    }
  }

  const dismiss = () => {
    pending.value = null
  }

  return { pending, confirm, dismiss }
}
