import { supabase } from '../utils/supabase.js'

export default function Login() {
  const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Aussie Retirement Simulator</h1>
        <p className="text-gray-400 max-w-md">
          Model your path to FIRE — including the Gap years before super kicks in.
        </p>
      </div>

      <div className="card w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-sm text-gray-400">Privacy-first. No bank feeds. Your data stays yours.</p>
        </div>
        <button
          onClick={signIn}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          Continue with Google
        </button>
      </div>

      <p className="text-xs text-gray-600 max-w-sm text-center">
        This tool is for educational modelling only and does not constitute financial advice.
        Consult a licensed financial adviser before making any financial decisions.
      </p>
    </div>
  )
}
