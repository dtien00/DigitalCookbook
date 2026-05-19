import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './lib/supabaseClient'
import Auth from './components/Auth'
import CreateRecipe from './components/CreateRecipe'
import RecipeDetail from './components/RecipeDetail'
import Profile from './components/Profile'

function App() {
    const [session, setSession] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showAuth, setShowAuth] = useState(false)
    const [selectedRecipe, setSelectedRecipe] = useState(null)
    const [editingRecipe, setEditingRecipe] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

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
    }

    const handleRecipeDeleted = () => {
        setSelectedRecipe(null)
        fetchRecipes()
    }

    const handleRecipeClick = (recipe) => {
        setSelectedRecipe(recipe)
        setShowProfile(false)
        setShowCreate(false)
    }

    if (showAuth) {
        return <Auth onBack={() => setShowAuth(false)} />
    }

    if (showProfile && session) {
        return <Profile
            session={session}
            onBack={() => setShowProfile(false)}
            onRecipeClick={handleRecipeClick}
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
                        <div
                            key={recipe.id}
                            onClick={() => handleRecipeClick(recipe)}
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
                                        {recipe.description && (
                                            <p className="m-0 text-white text-sm leading-snug line-clamp-2 max-h-0 opacity-0 mb-0 group-hover:max-h-16 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out drop-shadow">
                                                {recipe.description}
                                            </p>
                                        )}
                                        {recipe.tags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 max-h-0 opacity-0 mb-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out">
                                                {recipe.tags.slice(0, 3).map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 bg-white/25 backdrop-blur-sm text-white text-[11px] font-medium rounded-full">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <h3 className="m-0 text-white text-base font-semibold drop-shadow-md leading-tight">
                                            {recipe.title}
                                        </h3>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-5">
                                    <h3 className="m-0 mb-2 text-lg font-semibold text-gray-900">{recipe.title}</h3>
                                    <p className="m-0 text-sm text-gray-600 line-clamp-2">{recipe.description}</p>
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
            )}
        </div>
    )
}

export default App
