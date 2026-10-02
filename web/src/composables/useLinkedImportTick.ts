// The linked-tick offer: after an export is ticked or unticked, offer to do the same to the import
// it feeds on the destination factory. See linkedImportTickOffer in checklist.ts for the rules.
//
// The export tick is drawn in two places (the Satisfaction export chips and the Checklist panel),
// and the offer is one dialog mounted once by the planner, so the pending offer lives here at
// module scope where both the ticks and the dialog can reach it.
import { ref } from 'vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  applyLinkedImportTick,
  isChecklistExportComplete,
  LinkedImportTickOffer,
  linkedImportTickOffer,
  toggleChecklistExport,
} from '@/utils/factory-management/checklist'

export interface PendingLinkedImportTick {
  sourceFactoryId: number
  destinationFactoryId: number
  part: string
  offer: LinkedImportTickOffer
}

const pending = ref<PendingLinkedImportTick | null>(null)

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
    ? { sourceFactoryId: factory.id, destinationFactoryId: destination.id, part, offer }
    : null
}

export const useLinkedImportTick = () => {
  const confirm = (destination: Factory | undefined, enableChecklist: boolean) => {
    const current = pending.value
    pending.value = null
    if (!current || !destination || destination.id !== current.destinationFactoryId) return
    applyLinkedImportTick(
      destination,
      current.sourceFactoryId,
      current.part,
      current.offer.completed,
      enableChecklist && current.offer.offerEnableChecklist
    )
  }

  const dismiss = () => {
    pending.value = null
  }

  return { pending, confirm, dismiss }
}
