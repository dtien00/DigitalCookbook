import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'

export default function CreateRecipe({ onComplete, userId, recipeToEdit }) {
    const isEditMode = !!recipeToEdit

    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState(recipeToEdit?.title || '')
    const [description, setDescription] = useState(recipeToEdit?.description || '')
    const [servings, setServings] = useState(recipeToEdit?.servings || 1)
    const [isPublic, setIsPublic] = useState(recipeToEdit?.is_public ?? true)
    const [tagsInput, setTagsInput] = useState((recipeToEdit?.tags || []).join(', '))
    const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: '', notes: '' }])
    // Stage 15 item 1 — each step row carries optional photo state:
    //   photoFile    — File the user just picked (null if untouched)
    //   photoPreview — blob: URL for a new pick, OR public URL for an
    //                  existing edit-mode photo. Used for the <img> src.
    //   photoPath    — storage path carried from DB in edit mode. Null
    //                  for new steps and for steps the user removed.
    const [steps, setSteps] = useState([{ instruction: '', step_number: 1, photoFile: null, photoPreview: null, photoPath: null }])
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(recipeToEdit?.image_url || null)

    // Parse the comma-separated tag input into a clean, deduped, lowercase array.
    // Lowercase keeps "Vegan", "vegan", "VEGAN" from creating three buckets.
    const parsedTags = [...new Set(
        tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    )]

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
                setIngredients(ingData.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, notes: i.notes || '' })))
            }

            // Fetch steps
            const { data: stepData } = await supabase
                .from('steps')
                .select('*')
                .eq('recipe_id', recipeToEdit.id)
                .order('step_number', { ascending: true })

            if (stepData?.length > 0) {
                setSteps(stepData.map(s => ({
                    instruction: s.instruction,
                    step_number: s.step_number,
                    photoFile: null,
                    photoPath: s.photo_path || null,
                    photoPreview: s.photo_path
                        ? supabase.storage.from('recipe-steps').getPublicUrl(s.photo_path).data.publicUrl
                        : null,
                })))
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
        setIngredients([...ingredients, { name: '', quantity: '', unit: '', notes: '' }])
    }

    const addStep = () => {
        setSteps([...steps, { instruction: '', step_number: steps.length + 1, photoFile: null, photoPreview: null, photoPath: null }])
    }

    const handleStepPhotoChange = (index, file) => {
        if (!file) return
        const newSteps = [...steps]
        newSteps[index] = {
            ...newSteps[index],
            photoFile: file,
            photoPreview: URL.createObjectURL(file),
        }
        setSteps(newSteps)
    }

    // Clears both the new pick and any carry-forward path. On save, a step
    // with no file and no path writes photo_path=null, so the old storage
    // object becomes orphaned (same posture as recipe-images cover swaps).
    const handleStepPhotoRemove = (index) => {
        const newSteps = [...steps]
        newSteps[index] = {
            ...newSteps[index],
            photoFile: null,
            photoPreview: null,
            photoPath: null,
        }
        setSteps(newSteps)
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
                        image_url: imageUrl,
                        tags: parsedTags
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
                        image_url: imageUrl,
                        tags: parsedTags
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
                    notes: ing.notes?.trim() || null,
                    order_index: index
                }))

            if (ingredientsToInsert.length > 0) {
                const { error: ingError } = await supabase
                    .from('ingredients')
                    .insert(ingredientsToInsert)
                if (ingError) throw ingError
            }

            // Insert Steps. Carry forward existing photo_path values from
            // edit mode so unchanged photos stay attached after the
            // delete-then-reinsert cycle above. New file picks go through
            // a second pass after IDs are minted, since the storage path
            // includes the step.id.
            const nonEmptySteps = steps.filter(s => s.instruction.trim() !== '')
            const stepsToInsert = nonEmptySteps.map((step, index) => ({
                recipe_id: recipeId,
                step_number: index + 1,
                instruction: step.instruction,
                photo_path: step.photoFile ? null : (step.photoPath || null),
            }))

            let insertedSteps = []
            if (stepsToInsert.length > 0) {
                const { data: stepRows, error: stepError } = await supabase
                    .from('steps')
                    .insert(stepsToInsert)
                    .select('id, step_number')
                    .order('step_number', { ascending: true })
                if (stepError) throw stepError
                insertedSteps = stepRows
            }

            // Stage 15 item 1 — Option A: upload pending step photos now
            // that step IDs exist, then patch photo_path on each row.
            // Failures here leave the recipe saved with a missing photo;
            // surface a toast but don't roll back the recipe itself —
            // the user can re-edit and re-attach.
            const photoUpdatePromises = []
            for (let i = 0; i < nonEmptySteps.length; i++) {
                const step = nonEmptySteps[i]
                if (!step.photoFile) continue
                const inserted = insertedSteps[i]
                if (!inserted) continue
                photoUpdatePromises.push((async () => {
                    const ext = (step.photoFile.name.split('.').pop() || 'jpg').toLowerCase()
                    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
                    const path = `${recipeId}/${inserted.id}.${safeExt}`
                    const { error: uploadError } = await supabase.storage
                        .from('recipe-steps')
                        .upload(path, step.photoFile, { upsert: true, contentType: step.photoFile.type })
                    if (uploadError) throw uploadError
                    const { error: updateError } = await supabase
                        .from('steps')
                        .update({ photo_path: path })
                        .eq('id', inserted.id)
                    if (updateError) throw updateError
                })())
            }

            if (photoUpdatePromises.length > 0) {
                const results = await Promise.allSettled(photoUpdatePromises)
                const failed = results.filter(r => r.status === 'rejected').length
                if (failed > 0) {
                    toast.error(`Recipe saved, but ${failed} step photo${failed === 1 ? '' : 's'} failed to upload. Edit the recipe to retry.`)
                }
            }

            toast.success(isEditMode ? 'Recipe updated successfully!' : 'Recipe created successfully!')
            onComplete()
        } catch (error) {
            toast.error(error.message)
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
                        <div className="form-group">
                            <label>Tags <span className="text-sm text-gray-500 font-normal">(comma-separated)</span></label>
                            <input
                                type="text"
                                value={tagsInput}
                                onChange={e => setTagsInput(e.target.value)}
                                placeholder="vegan, weeknight, asian"
                            />
                            {parsedTags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {parsedTags.map(tag => (
                                        <span key={tag} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="form-section">
                        <h3>Ingredients</h3>
                        {ingredients.map((ing, index) => (
                            <div key={index} className="mb-3">
                                <div className="form-row">
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
                                <input
                                    placeholder="Notes (optional — e.g. or any neutral oil)"
                                    value={ing.notes || ''}
                                    onChange={e => handleIngredientChange(index, 'notes', e.target.value)}
                                    className="mt-1.5 w-full italic text-sm"
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
                                <div className="mt-2 flex items-start gap-3">
                                    {step.photoPreview ? (
                                        <div className="relative">
                                            <img
                                                src={step.photoPreview}
                                                alt={`Step ${index + 1} preview`}
                                                className="w-24 h-24 object-cover rounded-md border border-gray-300"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleStepPhotoRemove(index)}
                                                aria-label={`Remove photo for step ${index + 1}`}
                                                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-900 text-white text-xs"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="w-24 h-24 flex flex-col items-center justify-center text-xs text-gray-500 border border-dashed border-gray-300 rounded-md cursor-pointer hover:bg-gray-50">
                                            <span className="text-xl leading-none">+</span>
                                            <span className="mt-1">Add photo</span>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                className="hidden"
                                                onChange={e => handleStepPhotoChange(index, e.target.files?.[0])}
                                            />
                                        </label>
                                    )}
                                    <p className="text-xs text-gray-500 italic mt-1">
                                        Optional. One photo per step, ≤ 5 MB. JPG, PNG, or WebP.
                                    </p>
                                </div>
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
