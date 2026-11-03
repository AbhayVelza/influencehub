import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { firebaseApp } from './firebase'

// Firestore (all workspace data) and Storage (document files). Kept apart from src/lib/firebase.ts so the sign-in
// page loads only Firebase Auth; these load with the data layer (src/backend) on first use.

export const firestore = (): Firestore => getFirestore(firebaseApp())

export const firebaseStorage = (): FirebaseStorage => getStorage(firebaseApp())
