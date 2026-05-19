import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './lib/supabaseClient'
import { useFavorites } from './hooks/useFavorites'
import Auth from './components/Auth'
import CreateRecipe from './components/CreateRecipe'
import RecipeDetail from './components/RecipeDetail'
import Profile from './components/Profile'
import MyBookmarks from './components/MyBookmarks'
import RecipeCard from './components/RecipeCard'

function App() {
    const [session, setSession] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showBookmarks, setShowBookmarks] = useState(false)
    const [showAuth, setShowAuth] = useState(false)
    const [selectedRecipe, setSelectedRecipe] = useState(null)
    const [editingRecipe, setEditingRecipe] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    const { isFavorited, toggleFavorite } = useFavorites(session?.user.id)

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session)
            if (event === 'PASSWORD_RECOVERY') {
                setShowProfile(true)
            }
            // Close the auth view once a session is established
            if (session) {
                setShowAuth(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    // Fetch recipes for everyone, including anonymous visitors.
    // RLS filters: `is_public OR auth.uid() = author_id`, so anon users
    // see only public recipes; logged-in users see public + their own.
    // Refetch on session change so private recipes appear/disappear.
    useEffect(() => {
        fetchRecipes()
    }, [session])

    async function fetchRecipes() {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('recipes')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setRecipes(data || [])
        } catch (error) {
            console.error('Error fetching recipes:', error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
    }

    const handleEditRecipe = (recipe) => {
        setEditingRecipe(recipe)
        setShowCreate(true)
        setSelectedRecipe(null)
        setShowProfile(false)
        setShowBookmarks(false)
    }

    const handleRecipeDeleted = () => {
        setSelectedRecipe(null)
        fetchRecipes()
    }

    const handleRecipeClick = (recipe) => {
        setSelectedRecipe(recipe)
        setShowProfile(false)
        setShowCreate(false)
        setShowBookmarks(false)
    }

    // Bookmark click handler — anonymous users get the sign-in CTA, signed-in users toggle.
    const handleBookmarkClick = (recipeId) => {
        if (!session) {
            setShowAuth(true)
            return
        }
        toggleFavorite(recipeId)
    }

    if (showAuth) {
        return <Auth onBack={() => setShowAuth(false)} />
    }

    if (showProfile && session) {
        return <Profile
            session={session}
            onBack={() => setShowProfile(false)}
            onRecipeClick={handleRecipeClick}
            isFavorited={isFavorited}
            onToggleFavorite={handleBookmarkClick}
        />
    }

    if (showBookmarks && session) {
        return <MyBookmarks
            session={session}
            onBack={() => setShowBookmarks(false)}
            onRecipeClick={handleRecipeClick}
            isFavorited={isFavorited}
            onToggleFavorite={handleBookmarkClick}
        />
    }

    if (showCreate && session) {
        return <CreateRecipe
            userId={session.user.id}
            recipeToEdit={editingRecipe}
            onComplete={() => {
                setShowCreate(false)
                setEditingRecipe(null)
                fetchRecipes()
            }}
        />
    }

    if (selectedRecipe) {
        return <RecipeDetail
            recipe={selectedRecipe}
            userId={session?.user.id}
            onBack={() => setSelectedRecipe(null)}
            onEdit={handleEditRecipe}
            onDelete={handleRecipeDeleted}
            favorited={isFavorited(selectedRecipe.id)}
            onToggleFavorite={() => handleBookmarkClick(selectedRecipe.id)}
        />
    }

    const filteredRecipes = recipes.filter(recipe =>
        recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipe.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Density scales with the user's library size, not the filtered view, so cards
    // don't resize while searching. xl:columns-5 is the floor — beyond that cards
    // get pixel-mappy on standard laptop widths (~250px each at 1280px).
    const gridColumnsClass =
        recipes.length <= 3  ? 'columns-1 md:columns-2 xl:columns-2' :
        recipes.length <= 8  ? 'columns-1 sm:columns-2 lg:columns-3 xl:columns-3' :
        recipes.length <= 20 ? 'columns-1 sm:columns-2 md:columns-3 xl:columns-4' :
                               'columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5'

    return (
        <div className="max-w-7xl mx-auto px-5 py-5">
            <header className="flex justify-between items-center mb-10">
                <h1 className="text-2xl font-semibold text-gray-900">
                    {session ? `${session.user.email}'s Cookbook` : 'Digital Cookbook'}
                </h1>
                <div className="flex gap-3">
                    {session ? (
                        <>
                            <button onClick={() => setShowBookmarks(true)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Bookmarks</button>
                            <button onClick={() => setShowProfile(true)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Profile</button>
                            <button onClick={handleLogout} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Logout</button>
                        </>
                    ) : (
                        <button onClick={() => setShowAuth(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors">Sign In</button>
                    )}
                </div>
            </header>

            <div className="flex gap-4 items-center mb-8">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search recipes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-full text-base bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                    />
                </div>
                {session && (
                    <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors">+ New Recipe</button>
                )}
            </div>

            {loading ? (
                <p>Loading recipes...</p>
            ) : filteredRecipes.length === 0 ? (
                <p>No recipes found.</p>
            ) : (
                <div className={`${gridColumnsClass} gap-4 mt-6`}>
                    {filteredRecipes.map(recipe => (
                        <RecipeCard
                            key={recipe.id}
                            recipe={recipe}
                            onClick={() => handleRecipeClick(recipe)}
                            favorited={isFavorited(recipe.id)}
                            onToggleFavorite={() => handleBookmarkClick(recipe.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default App
