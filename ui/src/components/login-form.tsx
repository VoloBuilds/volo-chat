import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { auth, googleProvider } from "@/lib/firebase"
import { signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword } from "firebase/auth"

const GoogleIcon = () => (
  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
)

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSignInMode, setIsSignInMode] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      if (isSignInMode) {
        // Sign in mode - try to sign in directly
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        // Register mode - try to register first
        await createUserWithEmailAndPassword(auth, email, password)
        console.log('User registered and signed in')
      }
    } catch (err: any) {
      if (isSignInMode) {
        setError("Failed to sign in. Please check your credentials.")
        console.error('Sign in error:', err)
      } else {
        // In register mode, if user already exists, try to sign them in
        if (err.code === 'auth/email-already-in-use') {
          try {
            await signInWithEmailAndPassword(auth, email, password)
            console.log('User already exists, signed in instead')
          } catch (signInErr: any) {
            setError("Account exists but password is incorrect.")
            console.error('Sign in error after registration attempt:', signInErr)
          }
        } else {
          setError(`Failed to register: ${err.message}`)
          console.error('Registration error:', err)
        }
      }
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      setError("Failed to sign in with Google.")
      console.error(err)
    }
  }

  const toggleMode = () => {
    setIsSignInMode(!isSignInMode)
    setError("") // Clear any existing errors when switching modes
  }

  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>{isSignInMode ? "Sign In" : "Register"}</CardTitle>
        <CardDescription>
          {isSignInMode 
            ? "Enter your credentials to access your account." 
            : "Create a new account to get started."
          }
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Input
                id="email"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Input
                id="password"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full">
            {isSignInMode ? "Sign In" : "Register"}
          </Button>
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 my-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            className="w-full bg-white hover:bg-gray-50 text-gray-900 hover:text-gray-900 dark:bg-white dark:hover:bg-gray-50 dark:text-gray-900 dark:hover:text-gray-900 flex gap-2 items-center justify-center"
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon />
            Sign in with Google
          </Button>
          <div className="text-center text-sm text-muted-foreground mt-4">
            {isSignInMode ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={toggleMode}
              className="text-primary hover:underline"
            >
              {isSignInMode ? "Register" : "Sign In"}
            </button>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
} 