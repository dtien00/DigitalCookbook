import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Profile({ session, onBack, onRecipeClick }) {
    const [loading, setLoading] = useState(true)
    const [username, setUsername] = useState('')
    const [fullName, setFullName] = useState('')
    const [bio, setBio] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')
    const [userRecipes, setUserRecipes] = useState([])
    const [newPassword, setNewPassword] = useState('')
    const [passwordLoading, setPasswordLoading] = useState(false)

    useEffect(() => {
        getProfile()
        getUserRecipes()
    }, [session])

    async function getProfile() {
        try {
            setLoading(true)
            const { user } = session

            let { data, error, status } = await supabase
                .from('profiles')
                .select(`username, full_name, bio, avatar_url`)
                .eq('id', user.id)
                .single()

            if (error && status !== 406) {
                throw error
            }

            if (data) {
                setUsername(data.username || '')
                setFullName(data.full_name || '')
                setBio(data.bio || '')
                setAvatarUrl(data.avatar_url || '')
            }
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    async function getUserRecipes() {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('author_id', session.user.id)
            .order('created_at', { ascending: false })

        if (error) console.error('Error fetching user recipes:', error.message)
        else setUserRecipes(data || [])
    }

    async function updateProfile(e) {
        e.preventDefault()
        try {
            setLoading(true)
            const { user } = session

            const updates = {
                id: user.id,
                username,
                full_name: fullName,
                bio,
                avatar_url: avatarUrl,
                updated_at: new Date(),
            }

            let { error } = await supabase.from('profiles').upsert(updates)

            if (error) throw error
            alert('Profile updated!')
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    async function updatePassword(e) {
        e.preventDefault()
        try {
            setPasswordLoading(true)
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) throw error
            alert('Password updated successfully!')
            setNewPassword('')
        } catch (error) {
            alert(error.message)
        } finally {
            setPasswordLoading(false)
        }
    }

    return (
        <div className="profile-container">
            <header className="profile-header">
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">← Back to List</button>
                <h1>User Profile</h1>
            </header>

            <div className="profile-grid">
                <section className="profile-info-section">
                    <div className="form-card">
                        <h3>Edit Profile</h3>
                        <form onSubmit={updateProfile}>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="text" value={session.user.email} disabled />
                            </div>
                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Choose a username"
                                />
                            </div>
                            <div className="form-group">
                                <label>Bio</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="Tell us about your cooking..."
                                />
                            </div>
                            <button className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading}>
                                {loading ? 'Loading ...' : 'Update Profile'}
                            </button>
                        </form>
                    </div>

                    <div className="form-card" style={{ marginTop: '2rem' }}>
                        <h3>Change Password</h3>
                        <form onSubmit={updatePassword}>
                            <div className="form-group">
                                <label>New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    minLength={6}
                                />
                            </div>
                            <button className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={passwordLoading || !newPassword}>
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </section>

                <section className="user-recipes-section">
                    <h3>My Recipes ({userRecipes.length})</h3>
                    <div className="columns-1 sm:columns-2 md:columns-3 gap-4 mt-4">
                        {userRecipes.map(recipe => (
                            <div
                                key={recipe.id}
                                onClick={() => onRecipeClick(recipe)}
                                className="group mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-xl transition-shadow duration-300"
                            >
                                {recipe.image_url ? (
                                    <div className="relative overflow-hidden">
                                        <img
                                            src={recipe.image_url}
                                            alt={recipe.title}
                                            loading="lazy"
                                            className="block w-full h-auto transition-transform duration-500 ease-out group-hover:scale-105"
                                        />
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4">
                                            {recipe.tags?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 max-h-0 opacity-0 mb-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out">
                                                    {recipe.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="px-2 py-0.5 bg-white/25 backdrop-blur-sm text-white text-[11px] font-medium rounded-full">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <h4 className="m-0 text-white text-base font-semibold drop-shadow-md leading-tight">{recipe.title}</h4>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-5">
                                        <h4 className="m-0 text-lg font-semibold text-gray-900">{recipe.title}</h4>
                                        {recipe.tags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                {recipe.tags.slice(0, 3).map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] font-medium rounded-full">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
