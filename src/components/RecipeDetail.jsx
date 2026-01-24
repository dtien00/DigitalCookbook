import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function RecipeDetail({ recipe, userId, onBack, onEdit, onDelete }) {
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
                alert('Error deleting recipe: ' + error.message)
            }
        }
    }

    return (
        <div className="recipe-detail-container">
            <button onClick={onBack} className="btn-secondary">← Back to List</button>

            <div className="recipe-detail-header">
                {recipe.image_url && (
                    <img src={recipe.image_url} alt={recipe.title} className="detail-image" />
                )}
                <h1>{recipe.title}</h1>
                <p className="description">{recipe.description}</p>
                <div className="recipe-meta">
                    <span>Servings: {recipe.servings}</span>
                </div>
            </div>

            {isAuthor && (
                <div className="author-actions">
                    <button onClick={() => onEdit(recipe)} className="btn-primary">Edit Recipe</button>
                    <button onClick={handleDelete} className="btn-danger">Delete Recipe</button>
                </div>
            )}

            <div className="recipe-content">
                <section>
                    <h3>Ingredients</h3>
                    {loading ? <p>Loading...</p> : (
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
                    {loading ? <p>Loading...</p> : (
                        <ol className="step-list">
                            {steps.map(step => (
                                <li key={step.id}>
                                    {step.instruction}
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>
        </div>
    )
}
