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
                <button onClick={onBack} className="btn-secondary">← Back to List</button>
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
                            <button className="btn-primary" disabled={loading}>
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
                            <button className="btn-primary" disabled={passwordLoading || !newPassword}>
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </section>

                <section className="user-recipes-section">
                    <h3>My Recipes ({userRecipes.length})</h3>
                    <div className="recipe-grid">
                        {userRecipes.map(recipe => (
                            <div key={recipe.id} className="recipe-card" onClick={() => onRecipeClick(recipe)}>
                                {recipe.image_url ? (
                                    <div className="card-image-wrapper">
                                        <img src={recipe.image_url} alt={recipe.title} className="card-image" />
                                        <div className="card-overlay">
                                            <h4>{recipe.title}</h4>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="card-content">
                                        <h4>{recipe.title}</h4>
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
