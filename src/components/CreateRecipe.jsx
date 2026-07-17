import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { parseQuantity, quantityToDisplay } from '../lib/parseQuantity'
import { parseDurationToMs, formatMs } from '../lib/parseDuration'
import { ingredientsToRows, rowsToIngredients, stripLeadingEmptySection } from '../lib/ingredientSections'
import { useDragSort } from '../hooks/useDragSort'
import { arrayMove } from '../lib/dragSortCore'
import UnitCombobox from './UnitCombobox'
import DragHandleIcon from './DragHandleIcon'

// Column-order presets for an ingredient row. Purely a display concern — the
// data keys never move, so the layout choice doesn't touch what gets saved.
// The Enter "last field" target is whatever sits last in the active preset.
const LAYOUT_PRESETS = [
    ['name', 'quantity', 'unit'],
    ['quantity', 'unit', 'name'],
    ['unit', 'quantity', 'name'],
]
const FIELD_LABELS = { name: 'Name', quantity: 'Qty', unit: 'Unit' }

// Stage 21 — the ingredient editor holds a heterogeneous row list: ingredient
// rows plus section rows ({ type: 'section', name }). Section rows are never
// stored as rows; on save each ingredient inherits the nearest section row
// above it (src/lib/ingredientSections.js), and edit mode reconstructs them
// from the contiguous runs.
const emptyIngredientRow = () => ({ type: 'ingredient', name: '', quantity: '', unit: '', notes: '' })
// New recipes open with a blank section row above the first ingredient — a
// nudge toward "For the …" grouping. Dropped on save if left unnamed
// (stripLeadingEmptySection); edit mode replaces these rows with the loaded
// recipe, so the seed only affects a fresh create.
const emptySectionRow = () => ({ type: 'section', name: '' })

export default function CreateRecipe({ onComplete, userId, recipeToEdit }) {
    const isEditMode = !!recipeToEdit

    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState(recipeToEdit?.title || '')
    const [description, setDescription] = useState(recipeToEdit?.description || '')
    const [servings, setServings] = useState(recipeToEdit?.servings || 1)
    const [isPublic, setIsPublic] = useState(recipeToEdit?.is_public ?? true)
    const [tagsInput, setTagsInput] = useState((recipeToEdit?.tags || []).join(', '))
    const [rows, setRows] = useState([emptySectionRow(), emptyIngredientRow()])
    // Active column order for the ingredient triplet (see LAYOUT_PRESETS).
    const [ingredientLayout, setIngredientLayout] = useState(LAYOUT_PRESETS[0])
    // Map of `${rowIndex}:${field}` -> input element, for keyboard focus moves.
    const inputRefs = useRef({})
    // Field key to focus on the next render (e.g. after Enter adds a new row).
    const pendingFocusRef = useRef(null)
    // Stage 15 item 1 — each step row carries optional photo state:
    //   photoFile    — File the user just picked (null if untouched)
    //   photoPreview — blob: URL for a new pick, OR public URL for an
    //                  existing edit-mode photo. Used for the <img> src.
    //   photoPath    — storage path carried from DB in edit mode. Null
    //                  for new steps and for steps the user removed.
    const [steps, setSteps] = useState([{ instruction: '', step_number: 1, photoFile: null, photoPreview: null, photoPath: null, durationInput: '' }])
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
        // Load once per edit target; `fetchExistingDetails`/`isEditMode` both
        // derive from `recipeToEdit`, so keying on it alone is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeToEdit])

    // After a render that requested it (e.g. Enter added a row), move focus to
    // the target field. Runs every render but only acts when a target is set.
    useEffect(() => {
        if (!pendingFocusRef.current) return
        const el = inputRefs.current[pendingFocusRef.current]
        pendingFocusRef.current = null
        if (el) el.focus()
    })

    const focusField = (index, field) => {
        const el = inputRefs.current[`${index}:${field}`]
        if (el) el.focus()
    }

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
                // Stored numbers prefill as friendly fractions ("0.5" -> "½")
                // so the text field reads the way the author would type it.
                // Section rows are rebuilt from the contiguous runs (Stage 21).
                setRows(ingredientsToRows(ingData.map(i => ({
                    name: i.name,
                    quantity: quantityToDisplay(i.quantity),
                    unit: i.unit,
                    notes: i.notes || '',
                    section: i.section ?? null,
                }))))
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
                    // Stage 19 Phase 2 — round-trip the stored seconds back to a
                    // mm:ss string the input can show and re-parse.
                    durationInput: s.duration_seconds ? formatMs(s.duration_seconds * 1000) : '',
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

    // How many actual ingredient rows exist — section rows don't count toward
    // the "always keep one row" invariant.
    const ingredientCount = rows.filter(r => r.type === 'ingredient').length

    // A row's first focusable field: the section-name input, or whatever
    // column leads the active layout preset.
    const rowStartField = (row) => row.type === 'section' ? 'section' : ingredientLayout[0]
    const focusRowStart = (index) => focusField(index, rowStartField(rows[index]))

    // Insert a fresh ingredient row at `index` and focus its first visible
    // field once it renders. Refs rebind positionally, so mid-list inserts
    // need no key bookkeeping.
    const insertIngredientAt = (index) => {
        pendingFocusRef.current = `${index}:${ingredientLayout[0]}`
        setRows(prev => [...prev.slice(0, index), emptyIngredientRow(), ...prev.slice(index)])
    }

    const addIngredient = () => insertIngredientAt(rows.length)

    // Stage 21 — append a named section row; ingredient rows beneath it (until
    // the next section row) inherit the label on save.
    const addSection = () => {
        pendingFocusRef.current = `${rows.length}:section`
        setRows([...rows, { type: 'section', name: '' }])
    }

    // Drop a row. Ingredient rows keep the ≥1 invariant (the button is hidden
    // at one remaining); section rows are always removable — their former
    // ingredients just inherit the section above. Refs rebind positionally on
    // re-render, so only the now-unused tail keys need pruning; focus then
    // lands on whatever row slid into the freed slot.
    const removeRow = (index) => {
        if (rows[index].type === 'ingredient' && ingredientCount === 1) return
        const tail = rows.length - 1
        for (const field of ['name', 'quantity', 'unit', 'section']) {
            delete inputRefs.current[`${tail}:${field}`]
        }
        const next = rows.filter((_, i) => i !== index)
        const focusIndex = Math.min(index, next.length - 1)
        pendingFocusRef.current = `${focusIndex}:${rowStartField(next[focusIndex])}`
        setRows(next)
    }

    // Cycle to the next column-order preset (Name-first -> Amount-first ->
    // Unit-first -> ...). Only the visual arrangement changes.
    const cycleLayout = () => {
        const idx = LAYOUT_PRESETS.findIndex(p => p.join() === ingredientLayout.join())
        setIngredientLayout(LAYOUT_PRESETS[(idx + 1) % LAYOUT_PRESETS.length])
    }

    // Stage 21 — drag-to-reorder for every editor row (ingredient and section
    // alike), reusing the viewer's pointer-based hook. Moves are pure state;
    // nothing persists until the recipe saves.
    const rowSort = useDragSort({ onMove: (from, to) => setRows(prev => arrayMove(prev, from, to)) })

    // Enter was confirmed on `field` of row `index`. Advance within the row;
    // on the last visible field, keep the entry flow inside the current
    // section: add a row at the end (last row), insert a fresh ingredient row
    // in place when the next row is a section heading (never walk into
    // editing an existing section's name), or jump to the next ingredient row.
    const commitIngredientField = (index, field) => {
        const pos = ingredientLayout.indexOf(field)
        if (pos < ingredientLayout.length - 1) {
            focusField(index, ingredientLayout[pos + 1])
            return
        }
        if (index === rows.length - 1) {
            addIngredient()
        } else if (rows[index + 1].type === 'section') {
            insertIngredientAt(index + 1)
        } else {
            focusRowStart(index + 1)
        }
    }

    // Enter handler for the plain Name / Qty inputs. The Unit field is a
    // combobox and routes its Enter through onCommit instead (so a highlighted
    // suggestion gets selected first). preventDefault stops the form submitting.
    const handleIngredientKeyDown = (index, field, e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        commitIngredientField(index, field)
    }

    // Enter on a section-name input means "now give it an ingredient": a
    // fresh row is added/inserted beneath the heading unless one already
    // follows, in which case focus just moves there. Never advances into
    // another section's name input.
    const handleSectionKeyDown = (index, e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        if (index === rows.length - 1) addIngredient()
        else if (rows[index + 1].type === 'section') insertIngredientAt(index + 1)
        else focusRowStart(index + 1)
    }

    const addStep = () => {
        // Focus the new step's textarea once it renders (parallels addIngredient).
        pendingFocusRef.current = `step:${steps.length}`
        setSteps([...steps, { instruction: '', step_number: steps.length + 1, photoFile: null, photoPreview: null, photoPath: null, durationInput: '' }])
    }

    // Focus a step's instruction textarea (registered in inputRefs under a
    // `step:` key, alongside the ingredient field refs).
    const focusStep = (index) => {
        const el = inputRefs.current[`step:${index}`]
        if (el) el.focus()
    }

    // Ctrl/Cmd+Enter adds + focuses the next step (or advances to it). Plain
    // Enter is left alone — a step is a textarea that needs Enter for newlines
    // within an instruction, so unlike the single-line ingredient inputs this
    // never repurposes the bare key.
    const handleStepKeyDown = (index, e) => {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
        e.preventDefault()
        if (index === steps.length - 1) addStep()
        else focusStep(index + 1)
    }

    // Drop a step row. Keeps at least one row (the button is hidden at length 1).
    // step_number is recomputed from position on save, but renumber the
    // survivors so state stays self-consistent. A pending pick's blob: preview
    // is an object URL — revoke it so it doesn't leak; edit-mode previews are
    // https storage URLs (orphaned on save, same posture as a cover swap), so
    // leave those alone.
    const removeStep = (index) => {
        if (steps.length === 1) return
        const preview = steps[index].photoPreview
        if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
        setSteps(steps
            .filter((_, i) => i !== index)
            .map((s, i) => ({ ...s, step_number: i + 1 })))
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

    // Field edit on any row — ingredient triplet/notes, or a section's name.
    const handleRowFieldChange = (index, field, value) => {
        setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
    }

    const handleStepChange = (index, value) => {
        const newSteps = [...steps]
        newSteps[index].instruction = value
        setSteps(newSteps)
    }

    // Stage 19 Phase 2 — raw timer string per step; parsed to seconds on save.
    const handleStepDurationChange = (index, value) => {
        const newSteps = [...steps]
        newSteps[index] = { ...newSteps[index], durationInput: value }
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

            // Insert Ingredients. Section rows collapse into a `section` label
            // on each ingredient (nearest section row above; null when
            // unsectioned) — see src/lib/ingredientSections.js.
            const ingredientsToInsert = rowsToIngredients(stripLeadingEmptySection(rows))
                .filter(i => i.name.trim() !== '')
                .map((ing, index) => ({
                    recipe_id: recipeId,
                    name: ing.name,
                    // Fractions/mixed numbers ("1 1/2", "½") parse to a number
                    // for the NUMERIC column; empty/unparseable falls back to 0
                    // (preserving the prior `ing.quantity || 0` behavior).
                    quantity: parseQuantity(ing.quantity) ?? 0,
                    unit: ing.unit,
                    notes: ing.notes?.trim() || null,
                    section: ing.section,
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
            const stepsToInsert = nonEmptySteps.map((step, index) => {
                // Parse the author's timer string (bare-minutes / mm:ss) to whole
                // seconds; blank or unparseable collapses to NULL so the column
                // stays clean and the step just shows no preset chip.
                const durMs = parseDurationToMs(step.durationInput)
                return {
                    recipe_id: recipeId,
                    step_number: index + 1,
                    instruction: step.instruction,
                    photo_path: step.photoFile ? null : (step.photoPath || null),
                    duration_seconds: durMs ? Math.round(durMs / 1000) : null,
                }
            })

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
                        <div className="form-section-head">
                            <h3>Ingredients</h3>
                            <button
                                type="button"
                                onClick={cycleLayout}
                                className="column-layout-toggle"
                                title="Change the column order of each ingredient row"
                            >
                                ⇄ {ingredientLayout.map(f => FIELD_LABELS[f]).join(' · ')}
                            </button>
                        </div>
                        <div ref={rowSort.listRef}>
                            {rows.map((row, index) => {
                                const dragging = rowSort.dragIndex === index
                                const grip = (
                                    <button
                                        type="button"
                                        {...rowSort.handleProps(index)}
                                        aria-label={row.type === 'section'
                                            ? `Drag to reorder section ${row.name || index + 1}`
                                            : `Drag to reorder ingredient ${index + 1}`}
                                        title="Drag to reorder"
                                        className="row-grip"
                                    >
                                        <DragHandleIcon />
                                    </button>
                                )
                                // Stage 21 — a section row: single name input
                                // reading as an authored sub-heading. Always
                                // removable (its ingredients just fall to the
                                // section above).
                                if (row.type === 'section') {
                                    return (
                                        <div key={index} data-sort-row className={`form-row ${dragging ? 'opacity-60' : ''}`}>
                                            {grip}
                                            <input
                                                className="section-name"
                                                placeholder='Section name (e.g. "For the sauce")'
                                                type="text"
                                                value={row.name}
                                                ref={el => { inputRefs.current[`${index}:section`] = el }}
                                                onChange={e => handleRowFieldChange(index, 'name', e.target.value)}
                                                onKeyDown={e => handleSectionKeyDown(index, e)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeRow(index)}
                                                className="ingredient-remove"
                                                aria-label={`Remove section ${row.name || index + 1}`}
                                                title="Remove this section (its ingredients stay)"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )
                                }
                                return (
                                    <div key={index} data-sort-row className={`mb-3 ${dragging ? 'opacity-60' : ''}`}>
                                        <div className="form-row">
                                            {grip}
                                            {ingredientLayout.map(field => {
                                                if (field === 'unit') {
                                                    return (
                                                        <UnitCombobox
                                                            key="unit"
                                                            value={row.unit}
                                                            placeholder="Unit (e.g. cups)"
                                                            inputRef={el => { inputRefs.current[`${index}:unit`] = el }}
                                                            onChange={v => handleRowFieldChange(index, 'unit', v)}
                                                            onCommit={() => commitIngredientField(index, 'unit')}
                                                        />
                                                    )
                                                }
                                                const isQty = field === 'quantity'
                                                return (
                                                    <input
                                                        key={field}
                                                        className={isQty ? 'ingredient-qty' : undefined}
                                                        placeholder={isQty ? 'Qty (e.g. 1 1/2)' : 'Name'}
                                                        type="text"
                                                        inputMode={isQty ? 'text' : undefined}
                                                        value={isQty ? row.quantity : row.name}
                                                        ref={el => { inputRefs.current[`${index}:${field}`] = el }}
                                                        onChange={e => handleRowFieldChange(index, field, e.target.value)}
                                                        onKeyDown={e => handleIngredientKeyDown(index, field, e)}
                                                    />
                                                )
                                            })}
                                            {ingredientCount > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(index)}
                                                    className="ingredient-remove"
                                                    aria-label={`Remove ingredient ${index + 1}`}
                                                    title="Remove this ingredient"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            placeholder="Notes (optional — e.g. or any neutral oil)"
                                            value={row.notes || ''}
                                            onChange={e => handleRowFieldChange(index, 'notes', e.target.value)}
                                            className="mt-1.5 w-full italic text-sm"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                        <div className="ingredient-tools">
                            <button type="button" onClick={addIngredient} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Add Ingredient</button>
                            <button type="button" onClick={addSection} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Add Section</button>
                            <span className="ingredient-hint">Tip: press <kbd>Enter</kbd> on the last field to add a row, <kbd>Tab</kbd> to step across, or drag ⠿ to reorder.</span>
                        </div>
                    </section>

                    <section className="form-section">
                        <h3>Steps</h3>
                        {steps.map((step, index) => (
                            <div key={index} className="form-group">
                                <div className="step-head">
                                    <label>Step {index + 1}</label>
                                    {steps.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeStep(index)}
                                            className="ingredient-remove"
                                            aria-label={`Remove step ${index + 1}`}
                                            title="Remove this step"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    value={step.instruction}
                                    ref={el => { inputRefs.current[`step:${index}`] = el }}
                                    onChange={e => handleStepChange(index, e.target.value)}
                                    onKeyDown={e => handleStepKeyDown(index, e)}
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
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <label htmlFor={`step-duration-${index}`} className="text-xs text-gray-600 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <circle cx="12" cy="13" r="8" />
                                            <path d="M12 9v4l2 2" />
                                            <path d="M9 2h6" />
                                        </svg>
                                        Timer
                                    </label>
                                    <input
                                        id={`step-duration-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        value={step.durationInput}
                                        onChange={e => handleStepDurationChange(index, e.target.value)}
                                        placeholder="e.g. 10, 5:30, or 2:00:00 (HH:MM:SS)"
                                        className="w-32 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <span className="text-xs text-gray-500 italic">optional — offers a one-tap timer while cooking</span>
                                </div>
                            </div>
                        ))}
                        <div className="ingredient-tools">
                            <button type="button" onClick={addStep} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors">Add Step</button>
                            <span className="ingredient-hint">Tip: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on Mac) adds the next step.</span>
                        </div>
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
