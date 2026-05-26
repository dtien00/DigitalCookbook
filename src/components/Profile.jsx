import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'
import ProfileBookSpread from './ProfileBookSpread'

export default function Profile({
    session,
    onBack,
    onRecipeClick,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    onToggleLike,
    isFollowing,
    getNotifyPref,
    onUnfollow,
    onSetNotifyPref,
}) {
    const [loading, setLoading] = useState(true)
    const [username, setUsername] = useState('')
    const [fullName, setFullName] = useState('')
    const [bio, setBio] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')
    const [userRecipes, setUserRecipes] = useState([])
    const [newPassword, setNewPassword] = useState('')
    const [passwordLoading, setPasswordLoading] = useState(false)
    // Author profile rows for everyone the user follows. Fetched once on
    // mount; the displayed list filters via the central useFollowing state
    // (isFollowing prop) so optimistic unfollow / rollback stay in sync with
    // the rest of the app without a refetch.
    const [followedAuthors, setFollowedAuthors] = useState([])
    const [followingLoading, setFollowingLoading] = useState(true)

    useEffect(() => {
        getProfile()
        getUserRecipes()
        getFollowedAuthors()
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
            toast.error(error.message)
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

    async function getFollowedAuthors() {
        setFollowingLoading(true)
        const { data, error } = await supabase
            .from('follows')
            .select('following_id, created_at, following:profiles!following_id(id, username, full_name, avatar_url)')
            .eq('follower_id', session.user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching followed authors:', error.message)
            setFollowedAuthors([])
        } else {
            setFollowedAuthors(
                (data || [])
                    .filter(row => row.following)
                    .map(row => ({
                        id: row.following.id,
                        username: row.following.username,
                        full_name: row.following.full_name,
                        avatar_url: row.following.avatar_url,
                    }))
            )
        }
        setFollowingLoading(false)
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
            toast.success('Profile updated!')
        } catch (error) {
            toast.error(error.message)
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
            toast.success('Password updated successfully!')
            setNewPassword('')
        } catch (error) {
            toast.error(error.message)
        } finally {
            setPasswordLoading(false)
        }
    }

    return (
        <ProfileBookSpread
            header={
                <header className="flex items-center gap-4 flex-wrap">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back to List
                    </button>
                    <h1 className="font-display text-2xl sm:text-3xl text-ink m-0">User Profile</h1>
                </header>
            }
            leftPage={
                <div className="flex flex-col gap-8">
                    <div>
                        <h3 className="font-display text-xl text-ink mb-4">Edit Profile</h3>
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
                            <button
                                className="w-full px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={loading}
                            >
                                {loading ? 'Loading ...' : 'Update Profile'}
                            </button>
                        </form>
                    </div>

                    <div>
                        <h3 className="font-display text-xl text-ink mb-4">Change Password</h3>
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
                            <button
                                className="w-full px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={passwordLoading || !newPassword}
                            >
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            }
            rightPage={
                <div className="flex flex-col gap-10 min-w-0">
                    <section>
                        <h3 className="font-display text-xl text-ink mb-4">My Recipes ({userRecipes.length})</h3>
                        {userRecipes.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl text-tan mb-3">✦</p>
                                <p className="font-display text-lg text-ink mb-1">You haven't shared any recipes yet.</p>
                                <p className="font-display italic text-rose">Use "+ New Recipe" on the home page to add your first.</p>
                            </div>
                        ) : (
                            <div className="columns-1 sm:columns-2 lg:columns-2 xl:columns-3 gap-4">
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
                        )}
                    </section>

                    <FollowingSection
                        followedAuthors={followedAuthors}
                        loading={followingLoading}
                        isFollowing={isFollowing}
                        getNotifyPref={getNotifyPref}
                        onUnfollow={onUnfollow}
                        onSetNotifyPref={onSetNotifyPref}
                    />
                </div>
            }
        />
    )
}

// Followed-authors panel on the user's own Profile. Source-of-truth for
// which rows render is the central useFollowing state (isFollowing prop) —
// the local followedAuthors list is just the profile-data sidecar so we
// can show avatars / names without a second query per row. Unfollow
// rollback is handled by useFollowing, so a failed delete makes the row
// reappear without any local reconciliation here.
function FollowingSection({ followedAuthors, loading, isFollowing, getNotifyPref, onUnfollow, onSetNotifyPref }) {
    const visible = followedAuthors.filter(a => isFollowing?.(a.id))

    return (
        <section>
            <h3 className="font-display text-xl text-ink mb-4">Following ({visible.length})</h3>
            {loading ? (
                <p className="font-display italic text-rose" role="status">Loading…</p>
            ) : visible.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-2xl text-tan mb-3">✦</p>
                    <p className="font-display text-lg text-ink mb-1">You aren't following anyone yet.</p>
                    <p className="font-display italic text-rose">Open any recipe and tap the author's name to visit their profile.</p>
                </div>
            ) : (
                <ul className="flex flex-col gap-3 list-none p-0">
                    {visible.map(author => {
                        const displayName = author.username?.trim() || author.full_name?.trim() || 'Anonymous chef'
                        const notify = getNotifyPref?.(author.id) ?? false
                        return (
                            <li
                                key={author.id}
                                className="flex flex-wrap items-center gap-3 p-3 bg-paper-shade/50 border border-paper-shade rounded-lg"
                            >
                                {author.avatar_url ? (
                                    <img
                                        src={author.avatar_url}
                                        alt=""
                                        loading="lazy"
                                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                                    />
                                ) : (
                                    <div
                                        aria-hidden="true"
                                        className="w-12 h-12 rounded-full bg-tan-soft text-ink font-display text-lg font-semibold flex items-center justify-center flex-shrink-0"
                                    >
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <Link
                                        to={`/profile/${author.id}`}
                                        className="font-display text-ink font-semibold hover:text-rust transition-colors truncate block"
                                    >
                                        {displayName}
                                    </Link>
                                    <label className="inline-flex items-center gap-2 mt-1 text-sm text-ink/70 font-serif cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={notify}
                                            onChange={(e) => onSetNotifyPref?.(author.id, e.target.checked)}
                                            className="accent-rust w-4 h-4 cursor-pointer"
                                        />
                                        Notify me on new recipes
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onUnfollow?.(author.id)}
                                    aria-label={`Unfollow ${displayName}`}
                                    className="px-4 py-2 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-full transition-colors min-h-[44px] flex-shrink-0"
                                >
                                    Unfollow
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
