import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'
import ProfileBookSpread from './ProfileBookSpread'
import RecipesCarousel from './RecipesCarousel'
import ProfileTabs from './ProfileTabs'
import { BACKDROPS } from '../hooks/useBackdrop'

export default function Profile({
    session,
    onBack,
    onRecipeClick,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    onToggleLike,
    backdrop,
    onChooseBackdrop,
}) {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [username, setUsername] = useState('')
    const [fullName, setFullName] = useState('')
    const [bio, setBio] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')
    const [userRecipes, setUserRecipes] = useState([])
    const [newPassword, setNewPassword] = useState('')
    const [passwordLoading, setPasswordLoading] = useState(false)

    // The tab container has a fixed height of min(75vh, 700px) per the
    // Stage 14 item 4 spec. ResizeObserver still works — it resolves the
    // CSS height to a pixel value and passes it to the right-page carousel
    // so the book spread stays a stable rectangle across tab swaps.
    const leftContentRef = useRef(null)
    const [leftContentHeight, setLeftContentHeight] = useState(null)

    useEffect(() => {
        getProfile()
        getUserRecipes()
    }, [session])

    useEffect(() => {
        const el = leftContentRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(entries => {
            const next = entries[0]?.contentRect.height
            if (next) setLeftContentHeight(next)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

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

    const tabs = [
        {
            id: 'bio',
            label: 'Bio',
            color: '#b06452', // rust
            icon: <IconUser />,
            content: (
                <BioTab
                    email={session.user.email}
                    username={username}
                    setUsername={setUsername}
                    bio={bio}
                    setBio={setBio}
                    onSubmit={updateProfile}
                    loading={loading}
                />
            ),
        },
        {
            id: 'contact',
            label: 'Contact',
            color: '#8a8c5a', // muted olive
            icon: <IconMail />,
            content: <ContactTab email={session.user.email} />,
        },
        {
            id: 'security',
            label: 'Security',
            color: '#5d748a', // muted slate
            icon: <IconLock />,
            content: (
                <SecurityTab
                    newPassword={newPassword}
                    setNewPassword={setNewPassword}
                    onSubmit={updatePassword}
                    loading={passwordLoading}
                />
            ),
        },
        {
            id: 'appearance',
            label: 'Appearance',
            color: '#6a8068', // muted sage
            icon: <IconBrush />,
            content: (
                <AppearanceTab
                    backdrop={backdrop}
                    onChoose={onChooseBackdrop}
                />
            ),
        },
        {
            id: 'metrics',
            label: 'Metrics',
            color: '#7a5a6e', // muted plum
            icon: <IconChart />,
            content: <PlaceholderTab title="Metrics" subtitle="Activity stats coming in a future stage." />,
        },
        {
            id: 'usage',
            label: 'Usage',
            color: '#8a6a4a', // warm brown
            icon: <IconPie />,
            content: <PlaceholderTab title="Usage" subtitle="Usage insights coming in a future stage." />,
        },
        {
            id: 'following',
            label: 'Following',
            color: '#b06452', // rust (matches the standalone phonebook book accent)
            icon: <IconUserPlus />,
            detached: true,
            // Delegates to the standalone phonebook route — see ProfileTabs
            // for the onSelect contract. The detached chevron telegraphs
            // the route hop visually.
            onSelect: () => navigate('/profile/following'),
        },
    ]

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
                <ProfileTabs
                    tabs={tabs}
                    defaultTabId="bio"
                    containerRef={leftContentRef}
                />
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
                            <RecipesCarousel
                                recipes={userRecipes}
                                maxHeight={leftContentHeight}
                                renderRecipe={(recipe) => (
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
                                )}
                            />
                        )}
                    </section>
                </div>
            }
        />
    )
}

function BioTab({ email, username, setUsername, bio, setBio, onSubmit, loading }) {
    return (
        <div>
            <h3 className="font-display text-xl text-ink mb-4">Edit Profile</h3>
            <form onSubmit={onSubmit}>
                <div className="form-group">
                    <label>Email</label>
                    <input type="text" value={email} disabled />
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
    )
}

function ContactTab({ email }) {
    return (
        <div>
            <h3 className="font-display text-xl text-ink mb-4">Contact</h3>
            <div className="form-group">
                <label>Email</label>
                <input type="text" value={email} disabled />
            </div>
            <p className="font-serif italic text-ink/60 text-sm mt-4">
                Phone, website, and social links may be added in a future stage.
            </p>
        </div>
    )
}

function SecurityTab({ newPassword, setNewPassword, onSubmit, loading }) {
    return (
        <div>
            <h3 className="font-display text-xl text-ink mb-4">Change Password</h3>
            <form onSubmit={onSubmit}>
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
                    disabled={loading || !newPassword}
                >
                    {loading ? 'Updating...' : 'Update Password'}
                </button>
            </form>
            <p className="font-serif italic text-ink/60 text-sm mt-4">
                Email change and account deletion controls may be added in a future stage.
            </p>
        </div>
    )
}

// Stage 14 item 3 — backdrop selector. Each option is a radio-style card
// with a preview swatch that mirrors the actual CSS treatment from
// index.css, so the user sees the destination state before committing.
// Selection is immediate (no Apply button) since the change is reversible
// and the user wants to see the page they're configuring change as they
// pick. Persistence is owned by useBackdrop at App level — the tab is
// purely a renderer for the current pref + a callback to update it.
function AppearanceTab({ backdrop, onChoose }) {
    return (
        <div>
            <h3 className="font-display text-xl text-ink mb-2">Backdrop</h3>
            <p className="font-serif italic text-ink/60 text-sm mb-5">
                Choose the surface the cookbook rests on. Your choice is remembered on this device.
            </p>
            <ul role="radiogroup" aria-label="Backdrop options" className="flex flex-col gap-3">
                {BACKDROPS.map(option => {
                    const isActive = option.id === backdrop
                    return (
                        <li key={option.id}>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                onClick={() => onChoose(option.id)}
                                className={
                                    'w-full flex items-center gap-4 p-3 rounded-md border transition-colors text-left ' +
                                    (isActive
                                        ? 'border-rust bg-tan/20'
                                        : 'border-paper-shade hover:bg-paper-shade/60')
                                }
                            >
                                <span
                                    aria-hidden="true"
                                    data-backdrop-swatch={option.id}
                                    className="backdrop-swatch w-16 h-16 rounded-md flex-shrink-0 border border-ink/10 shadow-sm"
                                />
                                <span className="flex-1 min-w-0">
                                    <span className="block font-display text-base text-ink">{option.label}</span>
                                    <span className="block font-serif italic text-ink/60 text-sm">{option.description}</span>
                                </span>
                                {isActive && (
                                    <span className="text-rust font-semibold text-sm flex-shrink-0" aria-hidden="true">
                                        Selected
                                    </span>
                                )}
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function PlaceholderTab({ title, subtitle }) {
    return (
        <div className="text-center py-12">
            <h3 className="font-display text-xl text-ink mb-3">{title}</h3>
            <p className="text-2xl text-tan mb-3">✦</p>
            <p className="font-serif italic text-rose">{subtitle}</p>
        </div>
    )
}

// Stage 14 item 4 — bookmark-ribbon tab icons. Stroke-based feather-style
// glyphs, sized for the 18px icon slot on each ribbon. `currentColor` is
// driven by the ribbon's text color (white on the ribbon background) so a
// single icon definition works for both ribbon and detached treatments.
const iconProps = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
}

function IconUser() {
    return (
        <svg {...iconProps}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
        </svg>
    )
}

function IconMail() {
    return (
        <svg {...iconProps}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
        </svg>
    )
}

function IconLock() {
    return (
        <svg {...iconProps}>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    )
}

function IconBrush() {
    return (
        <svg {...iconProps}>
            <path d="M14 3l7 7-9 9H5v-7l9-9z" />
            <path d="m12 5 7 7" />
        </svg>
    )
}

function IconChart() {
    return (
        <svg {...iconProps}>
            <path d="M4 20V10" />
            <path d="M10 20V4" />
            <path d="M16 20v-7" />
            <path d="M22 20H2" />
        </svg>
    )
}

function IconPie() {
    return (
        <svg {...iconProps}>
            <path d="M21 12A9 9 0 1 1 12 3v9h9z" />
            <path d="M12 3a9 9 0 0 1 9 9h-9z" />
        </svg>
    )
}

function IconUserPlus() {
    return (
        <svg {...iconProps}>
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
        </svg>
    )
}

