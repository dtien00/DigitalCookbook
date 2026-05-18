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
    const [selectedRecipe, setSelectedRecipe] = useState(null)
    const [editingRecipe, setEditingRecipe] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (session) fetchRecipes()
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

    if (!session) {
        return <Auth />
    }

    if (showProfile) {
        return <Profile
            session={session}
            onBack={() => setShowProfile(false)}
            onRecipeClick={handleRecipeClick}
        />
    }

    if (showCreate) {
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
            userId={session.user.id}
            onBack={() => setSelectedRecipe(null)}
            onEdit={handleEditRecipe}
            onDelete={handleRecipeDeleted}
        />
    }

    const filteredRecipes = recipes.filter(recipe =>
        recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipe.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="container">
            <header className="header">
                <h1>{session.user.email}'s Cookbook</h1>
                <div className="header-right">
                    <button onClick={() => setShowProfile(true)} className="btn-secondary">Profile</button>
                    <button onClick={handleLogout} className="btn-secondary">Logout</button>
                </div>
            </header>

            <div className="actions">
                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Search recipes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Recipe</button>
            </div>

            {loading ? (
                <p>Loading recipes...</p>
            ) : (
                <div className="recipe-grid">
                    {filteredRecipes.length === 0 ? (
                        <p>No recipes found.</p>
                    ) : (
                        filteredRecipes.map(recipe => (
                            <div
                                key={recipe.id}
                                className="recipe-card"
                                onClick={() => handleRecipeClick(recipe)}
                            >
                                {recipe.image_url ? (
                                    <div className="card-image-wrapper">
                                        <img src={recipe.image_url} alt={recipe.title} className="card-image" />
                                        <div className="card-overlay">
                                            <h3>{recipe.title}</h3>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="card-content">
                                        <h3>{recipe.title}</h3>
                                        <p className="description-preview">{recipe.description}</p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

export default App
