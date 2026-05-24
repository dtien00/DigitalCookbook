import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { getAuthRedirectURL } from '../../lib/authRedirect'

// Shared auth state + handlers. Any visual style under src/components/auth/styles/
// consumes this hook and renders its own chrome — keeps the network/Supabase
// logic in one place so a style swap can't accidentally diverge in behavior.
export function useAuthForm() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [view, setView] = useState('login')

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (view === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { username: email.split('@')[0] } },
                })
                if (error) throw error
                toast.success('Check your email for the confirmation link!')
            } else if (view === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
            } else if (view === 'forgot_password') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                })
                if (error) throw error
                toast.success('Password reset link sent to your email!')
                setView('login')
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    // OAuth handler. Provider must be enabled in the Supabase project's Auth
    // settings; if it isn't, signInWithOAuth surfaces a clear error which we
    // toast back to the user. `getAuthRedirectURL()` preserves the current
    // pathname so the user lands back on the same recipe they were viewing
    // when they opened the Auth overlay, and pins the origin to VITE_SITE_URL
    // on Preview where window.location.origin wouldn't be allowlisted.
    const handleOAuth = async (provider) => {
        setLoading(true)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: { redirectTo: getAuthRedirectURL() },
            })
            if (error) throw error
        } catch (error) {
            toast.error(error.message)
            setLoading(false)
        }
    }

    return {
        loading,
        email, setEmail,
        password, setPassword,
        view, setView,
        handleAuth,
        handleOAuth,
    }
}
