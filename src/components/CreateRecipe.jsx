import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function CreateRecipe({ onComplete, userId, recipeToEdit }) {
    const isEditMode = !!recipeToEdit

    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState(recipeToEdit?.title || '')
    const [description, setDescription] = useState(recipeToEdit?.description || '')
    const [servings, setServings] = useState(recipeToEdit?.servings || 1)
    const [isPublic, setIsPublic] = useState(recipeToEdit?.is_public ?? true)
    const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: '' }])
    const [steps, setSteps] = useState([{ instruction: '', step_number: 1 }])
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(recipeToEdit?.image_url || null)

    useEffect(() => {
        if (isEditMode) {
            fetchExistingDetails()
        }
    }, [recipeToEdit])

    async function fetchExistingDetails() {
        try {
            setLoading(true)
            // Fetch ingredients
            const { data: ingData } = await supabase
                .from('ingredients')
                .select('*')
                .eq('recipe_id', recipeToEdit.id)
                .order('order_index', { ascending: true })

            if (ingData?.length > 0) {
                setIngredients(ingData.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })))
            }

            // Fetch steps
            const { data: stepData } = await supabase
                .from('steps')
                .select('*')
                .eq('recipe_id', recipeToEdit.id)
                .order('step_number', { ascending: true })

            if (stepData?.length > 0) {
                setSteps(stepData.map(s => ({ instruction: s.instruction, step_number: s.step_number })))
            }
        } catch (error) {
            console.error('Error fetching details:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleImageChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            setImageFile(file)
            setImagePreview(URL.createObjectURL(file))
        }
    }

    const uploadImage = async (file) => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${userId}/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('recipe-images')
            .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
            .from('recipe-images')
            .getPublicUrl(filePath)

        return publicUrl
    }

    const addIngredient = () => {
        setIngredients([...ingredients, { name: '', quantity: '', unit: '' }])
    }

    const addStep = () => {
        setSteps([...steps, { instruction: '', step_number: steps.length + 1 }])
    }

    const handleIngredientChange = (index, field, value) => {
        const newIngredients = [...ingredients]
        newIngredients[index][field] = value
        setIngredients(newIngredients)
    }

    const handleStepChange = (index, value) => {
        const newSteps = [...steps]
        newSteps[index].instruction = value
        setSteps(newSteps)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            let imageUrl = imagePreview
            if (imageFile) {
                imageUrl = await uploadImage(imageFile)
            }

            let recipeId = recipeToEdit?.id

            if (isEditMode) {
                // Update Recipe
                const { error: recipeError } = await supabase
                    .from('recipes')
                    .update({
                        title,
                        description,
                        servings,
                        is_public: isPublic,
                        image_url: imageUrl
                    })
                    .eq('id', recipeId)

                if (recipeError) throw recipeError

                // Delete old ingredients and steps to replace them
                await supabase.from('ingredients').delete().eq('recipe_id', recipeId)
                await supabase.from('steps').delete().eq('recipe_id', recipeId)
            } else {
                // Insert Recipe
                const { data: recipe, error: recipeError } = await supabase
                    .from('recipes')
                    .insert([{
                        author_id: userId,
                        title,
                        description,
                        servings,
                        is_public: isPublic,
                        image_url: imageUrl
                    }])
                    .select()
                    .single()

                if (recipeError) throw recipeError
                recipeId = recipe.id
            }

            // Insert Ingredients
            const ingredientsToInsert = ingredients
                .filter(i => i.name.trim() !== '')
                .map((ing, index) => ({
                    recipe_id: recipeId,
                    name: ing.name,
                    quantity: ing.quantity || 0,
                    unit: ing.unit,
                    order_index: index
                }))

            if (ingredientsToInsert.length > 0) {
                const { error: ingError } = await supabase
                    .from('ingredients')
                    .insert(ingredientsToInsert)
                if (ingError) throw ingError
            }

            // Insert Steps
            const stepsToInsert = steps
                .filter(s => s.instruction.trim() !== '')
                .map((step, index) => ({
                    recipe_id: recipeId,
                    step_number: index + 1,
                    instruction: step.instruction
                }))

            if (stepsToInsert.length > 0) {
                const { error: stepError } = await supabase
                    .from('steps')
                    .insert(stepsToInsert)
                if (stepError) throw stepError
            }

            alert(isEditMode ? 'Recipe updated successfully!' : 'Recipe created successfully!')
            onComplete()
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="create-recipe-container">
            <div className="form-card">
                <h2>{isEditMode ? 'Edit Recipe' : 'Create New Recipe'}</h2>
                <form onSubmit={handleSubmit}>
                    <section className="form-section">
                        <h3>Basic Info</h3>
                        <div className="form-group image-upload">
                            <label>Cover Image</label>
                            <div className="image-preview-container">
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Preview" className="preview-img" />
                                ) : (
                                    <div className="placeholder-preview">No image selected</div>
                                )}
                                <input type="file" accept="image/*" onChange={handleImageChange} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Servings</label>
                                <input type="number" value={servings} onChange={e => setServings(e.target.value)} min="1" />
                            </div>
                            <div className="form-group-inline">
                                <label>
                                    <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                                    Make Public
                                </label>
                            </div>
                        </div>
                    </section>

                    <section className="form-section">
                        <h3>Ingredients</h3>
                        {ingredients.map((ing, index) => (
                            <div key={index} className="form-row">
                                <input
                                    placeholder="Name"
                                    value={ing.name}
                                    onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                                />
                                <input
                                    placeholder="Qty"
                                    type="number"
                                    value={ing.quantity}
                                    onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                                />
                                <input
                                    placeholder="Unit (e.g. cups)"
                                    value={ing.unit}
                                    onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                                />
                            </div>
                        ))}
                        <button type="button" onClick={addIngredient} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Add Ingredient</button>
                    </section>

                    <section className="form-section">
                        <h3>Steps</h3>
                        {steps.map((step, index) => (
                            <div key={index} className="form-group">
                                <label>Step {index + 1}</label>
                                <textarea
                                    value={step.instruction}
                                    onChange={e => handleStepChange(index, e.target.value)}
                                />
                            </div>
                        ))}
                        <button type="button" onClick={addStep} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Add Step</button>
                    </section>

                    <div className="form-actions">
                        <button type="button" onClick={onComplete} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Cancel</button>
                        <button type="submit" disabled={loading} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? (isEditMode ? 'Updating...' : 'Creating...') : 'Save Recipe'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
