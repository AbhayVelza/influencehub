import { PROTOTYPE } from '@/lib/mode'
import * as firestoreStore from './firestore-store'
import * as localStore from './local-store'

export type { Access } from './firestore-store'

// Where the working copy (`db`) is loaded from and saved to: Firestore when Firebase is configured, this browser's
// IndexedDB in prototype mode (src/lib/mode.ts). Both keep the same contract.
const store = PROTOTYPE ? localStore : firestoreStore

export const connect = (uid: string) => store.connect(uid)
export const disconnect = () => store.disconnect()
export const flush = () => store.flush()
export const revert = () => store.revert()
