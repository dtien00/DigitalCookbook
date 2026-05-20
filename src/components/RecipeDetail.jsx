import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import BookmarkButton from './BookmarkButton'
import LikeButton from './LikeButton'
import Comments from './Comments'
import Skeleton from './Skeleton'

export default function RecipeDetail({
    recipe,
    userId,
    onBack,
    onEdit,
    onDelete,
    favorited,
    onToggleFavorite,
    liked,
    likeCount = 0,
    onToggleLike,
    onRequireAuth,
}) {
    const [ingredients, setIngredients] = useState([])
    const [steps, setSteps] = useState([])
    const [loading, setLoading] = useState(true)

    const isAuthor = userId === recipe.author_id

    useEffect(() => {
        fetchRecipeDetails()
    }, [recipe.id])

    async function fetchRecipeDetails() {
        try {
            setLoading(true)

            // Fetch ingredients
            const { data: ingData, error: ingError } = await supabase
                .from('ingredients')
                .select('*')
                .eq('recipe_id', recipe.id)
                .order('order_index', { ascending: true })

            if (ingError) throw ingError

            // Fetch steps
            const { data: stepData, error: stepError } = await supabase
                .from('steps')
                .select('*')
                .eq('recipe_id', recipe.id)
                .order('step_number', { ascending: true })

            if (stepError) throw stepError

            setIngredients(ingData || [])
            setSteps(stepData || [])
        } catch (error) {
            console.error('Error fetching recipe details:', error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this recipe?')) {
            try {
                const { error } = await supabase
                    .from('recipes')
                    .delete()
                    .eq('id', recipe.id)

                if (error) throw error
                onDelete()
            } catch (error) {
                toast.error('Error deleting recipe: ' + error.message)
            }
        }
    }

    return (
        <div className="paper-grain min-h-screen">
            <div className="recipe-detail-container">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={onBack} className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors">← Back to List</button>
                    <div className="flex items-center gap-3">
                        {onToggleLike && (
                            <LikeButton liked={liked} count={likeCount} onClick={onToggleLike} size="lg" />
                        )}
                        {onToggleFavorite && (
                            <BookmarkButton favorited={favorited} onClick={onToggleFavorite} size="lg" />
                        )}
                    </div>
                </div>

                <div className="recipe-detail-header">
                    {recipe.image_url && (
                        <img src={recipe.image_url} alt={`${recipe.title} cover image`} loading="lazy" className="detail-image" />
                    )}
                    <h1>{recipe.title}</h1>
                    <p className="description">{recipe.description}</p>
                    {recipe.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-center mt-4 mb-2">
                            {recipe.tags.map(tag => (
                                <span key={tag} className="px-2.5 py-1 bg-tan-soft text-ink text-xs font-medium rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="recipe-meta">
                        <span>Servings: {recipe.servings}</span>
                    </div>
                </div>

                {isAuthor && (
                    <div className="author-actions">
                        <button onClick={() => onEdit(recipe)} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors">Edit Recipe</button>
                        <button onClick={handleDelete} className="px-4 py-2 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-md transition-colors">Delete Recipe</button>
                    </div>
                )}

                <div className="recipe-content">
                    <section>
                        <h3>Ingredients</h3>
                        {loading ? (
                            <ul className="space-y-3" role="status" aria-label="Loading ingredients">
                                {['w-full', 'w-3/5', 'w-4/5', 'w-3/5'].map((w, i) => (
                                    <Skeleton key={i} className={`h-4 ${w}`} />
                                ))}
                            </ul>
                        ) : (
                            <ul className="ingredient-list">
                                {ingredients.map(ing => (
                                    <li key={ing.id}>
                                        {ing.quantity} {ing.unit} {ing.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <hr />

                    <section>
                        <h3>Steps</h3>
                        {loading ? (
                            <ol className="space-y-3" role="status" aria-label="Loading steps">
                                {['w-full', 'w-4/5', 'w-full', 'w-3/5', 'w-4/5'].map((w, i) => (
                                    <Skeleton key={i} className={`h-4 ${w}`} />
                                ))}
                            </ol>
                        ) : (
                            <ol className="step-list">
                                {steps.map(step => (
                                    <li key={step.id}>
                                        {step.instruction}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>

                    <Comments
                        recipeId={recipe.id}
                        userId={userId}
                        onRequireAuth={onRequireAuth}
                    />
                </div>
            </div>
        </div>
    )
}
