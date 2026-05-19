import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth({ onBack }) {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [view, setView] = useState('login') // login, signup, forgot_password

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (view === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username: email.split('@')[0], // Default username
                        }
                    }
                })
                if (error) throw error
                alert('Check your email for the confirmation link!')
            } else if (view === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
            } else if (view === 'forgot_password') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                })
                if (error) throw error
                alert('Password reset link sent to your email!')
                setView('login')
            }
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                {onBack && (
                    <button onClick={onBack} className="bg-transparent border-0 p-0 mb-4 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2">
                        ← Back to recipes
                    </button>
                )}
                <h2>
                    {view === 'signup' && 'Create Account'}
                    {view === 'login' && 'Welcome Back'}
                    {view === 'forgot_password' && 'Reset Password'}
                </h2>
                <form onSubmit={handleAuth}>
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    {view !== 'forgot_password' && (
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? 'Processing...' :
                            (view === 'signup' ? 'Sign Up' :
                                view === 'login' ? 'Login' : 'Send Reset Link')}
                    </button>
                </form>

                <div className="auth-toggle">
                    {view === 'login' && (
                        <>
                            <p>
                                Don't have an account?{' '}
                                <button onClick={() => setView('signup')} className="bg-transparent border-0 p-0 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2">Sign Up</button>
                            </p>
                            <p>
                                <button onClick={() => setView('forgot_password')} className="bg-transparent border-0 p-0 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2">Forgot Password?</button>
                            </p>
                        </>
                    )}

                    {view === 'signup' && (
                        <p>
                            Already have an account?{' '}
                            <button onClick={() => setView('login')} className="bg-transparent border-0 p-0 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2">Login</button>
                        </p>
                    )}

                    {view === 'forgot_password' && (
                        <p>
                            <button onClick={() => setView('login')} className="bg-transparent border-0 p-0 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2">Back to Login</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
