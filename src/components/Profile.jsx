import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'

export default function Profile({
    session,
    onBack,
    onRecipeClick,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    onToggleLike,
}) {
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
                            <RecipeCard
                                key={recipe.id}
                                recipe={recipe}
                                onClick={() => onRecipeClick(recipe)}
                                favorited={isFavorited ? isFavorited(recipe.id) : false}
                                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(recipe.id) : undefined}
                                liked={userLiked ? userLiked(recipe.id) : false}
                                likeCount={likeCount ? likeCount(recipe.id) : 0}
                                onToggleLike={onToggleLike ? () => onToggleLike(recipe.id) : undefined}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
