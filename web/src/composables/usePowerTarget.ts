import { ref, watch } from 'vue'

// The user's arbitrary grid generation target (MW), persisted per browser. It exists
// because the plan can never model every in-game power consumer, so users aim for a
// number instead. Module-level singleton so every consumer shares the same live value.
const storedTarget = Number(localStorage.getItem('powerTarget'))
const powerTarget = ref<number>(Number.isFinite(storedTarget) ? storedTarget : 0)

watch(powerTarget, value => {
  localStorage.setItem('powerTarget', String(Number.isFinite(value) ? value : 0))
})

export const usePowerTarget = () => ({ powerTarget })
