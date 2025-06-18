import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signInAnonymously, linkWithCredential, EmailAuthProvider, linkWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { upgradeUserAccount } from './serverComm'

type AuthContextType = {
  user: User | null
  loading: boolean
  isAnonymous: boolean
  upgradeAnonymousUser: (email: string, password: string) => Promise<void>
  upgradeAnonymousUserWithGoogle: () => Promise<void>
  signOutExplicitly: () => Promise<void>
  resetSignOutFlag: () => void
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  isAnonymous: false,
  upgradeAnonymousUser: async () => {},
  upgradeAnonymousUserWithGoogle: async () => {},
  signOutExplicitly: async () => {},
  resetSignOutFlag: () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [hasExplicitlySignedOut, setHasExplicitlySignedOut] = useState(false)

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Clear any pending anonymous sign-in timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (user) {
        setUser(user)
        setIsAnonymous(user.isAnonymous)
        setLoading(false)
        // Reset explicit sign-out flag when user is present
        setHasExplicitlySignedOut(false)
      } else {
        // Only sign in anonymously if user hasn't explicitly signed out
        if (!hasExplicitlySignedOut) {
          // Wait a bit for Firebase to restore existing sessions before falling back to anonymous sign-in
          timeoutId = setTimeout(async () => {
            try {
              console.log('No existing session found, signing in anonymously...')
              const result = await signInAnonymously(auth)
              setUser(result.user)
              setIsAnonymous(true)
              setLoading(false)
            } catch (error) {
              console.error('Failed to sign in anonymously:', error)
              setUser(null)
              setIsAnonymous(false)
              setLoading(false)
            }
          }, 1000) // Wait 1 second for Firebase to restore session
        } else {
          // User explicitly signed out, don't auto sign-in
          setUser(null)
          setIsAnonymous(false)
          setLoading(false)
        }
      }
    })

    return () => {
      unsubscribe()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [hasExplicitlySignedOut])

  const upgradeAnonymousUser = async (email: string, password: string) => {
    if (!user || !user.isAnonymous) {
      throw new Error('User is not anonymous or not logged in')
    }

    try {
      const credential = EmailAuthProvider.credential(email, password)
      const result = await linkWithCredential(user, credential)
      
      // Notify backend about the account upgrade
      await upgradeUserAccount({
        email: result.user.email!,
        displayName: result.user.displayName || undefined,
        photoURL: result.user.photoURL || undefined,
      })
      
      // Immediately update the local state to reflect the upgrade
      setUser(result.user)
      setIsAnonymous(false)
      
      console.log('Anonymous user upgraded and backend notified')
      // User will also be updated automatically through onAuthStateChanged
    } catch (error) {
      console.error('Failed to upgrade anonymous user:', error)
      throw error
    }
  }

  const upgradeAnonymousUserWithGoogle = async () => {
    if (!user || !user.isAnonymous) {
      throw new Error('User is not anonymous or not logged in')
    }

    try {
      const result = await linkWithPopup(user, googleProvider)
      
      // Notify backend about the account upgrade
      await upgradeUserAccount({
        email: result.user.email!,
        displayName: result.user.displayName || undefined,
        photoURL: result.user.photoURL || undefined,
      })
      
      // Immediately update the local state to reflect the upgrade
      setUser(result.user)
      setIsAnonymous(false)
      
      console.log('Anonymous user upgraded with Google and backend notified')
      // User will also be updated automatically through onAuthStateChanged
    } catch (error) {
      console.error('Failed to upgrade anonymous user with Google:', error)
      throw error
    }
  }

  // Add a function to handle explicit sign out
  const signOutExplicitly = async () => {
    setHasExplicitlySignedOut(true)
    await signOut(auth)
  }

  // Add a function to reset the sign-out flag (useful for login page)
  const resetSignOutFlag = () => {
    setHasExplicitlySignedOut(false)
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAnonymous,
      upgradeAnonymousUser,
      upgradeAnonymousUserWithGoogle,
      signOutExplicitly,
      resetSignOutFlag
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext) 