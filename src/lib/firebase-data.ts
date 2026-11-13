import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { firebaseApp } from './firebase'

// Firebase Storage (document files). Kept apart from src/lib/firebase.ts so the sign-in page loads only Firebase
// Auth; this loads when someone uploads a document.

export const firebaseStorage = (): FirebaseStorage => getStorage(firebaseApp())
