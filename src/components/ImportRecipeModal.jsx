import { useState, useEffect, useRef } from 'react'
import { parseRecipeImport } from '../lib/recipeImport'

// Stage 22 — paste-to-prefill import, reachable only from CreateRecipe's
// create mode. Pure form-filler: nothing here touches Supabase; "Fill form"
// hands the parsed recipe to the parent, which routes it through the same
// setters hand-typing uses. Overlay posture mirrors AddToPlanModal; the
// surfaces inside keep the editor's legacy palette until the deferred
// CreateRecipe retint (Stage 21 precedent).

const SOURCE_LABELS = {
    'json-ld': 'structured recipe data',
    export: 'a Digital Cookbook export',
    text: 'pasted text',
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Files the drop zone / picker accept. The extension check is a convenience
// guard, not a safety boundary — the parser rejects anything non-recipe anyway.
const ACCEPTED_EXT = /\.(txt|md|json)$/i

function summarize(recipe) {
    const sections = new Set(recipe.ingredients.map(i => i.section).filter(Boolean)).size
    const parts = [
        plural(recipe.ingredients.length, 'ingredient') + (sections > 0 ? ` in ${plural(sections, 'section')}` : ''),
        plural(recipe.steps.length, 'step'),
    ]
    if (recipe.servings) parts.push(`serves ${recipe.servings}`)
    if (recipe.tags.length > 0) parts.push(plural(recipe.tags.length, 'tag'))
    return parts.join(', ')
}

export default function ImportRecipeModal({ onClose, onApply }) {
    const [raw, setRaw] = useState('')
    // null until Preview runs; editing the paste invalidates the old result so
    // "Fill form" can never apply a preview the text no longer matches.
    const [result, setResult] = useState(null)
    const [dragActive, setDragActive] = useState(false)
    const textareaRef = useRef(null)

    useEffect(() => { textareaRef.current?.focus() }, [])

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleChange = (e) => {
        setRaw(e.target.value)
        if (result) setResult(null)
    }

    // Drop or pick a recipe file. A dropped file is a complete document, so we
    // fill the textarea AND auto-run the parse (typing waits for an explicit
    // Preview because it's mid-edit; a file isn't). Multiple files: import the
    // first and warn about the rest — the batch queue (INPUT.md §2.2) is the
    // real multi-file answer; this degrades gracefully until then.
    const importFile = async (files) => {
        if (!files || files.length === 0) return
        const file = files[0]
        if (!ACCEPTED_EXT.test(file.name)) {
            setResult({ recipe: null, source: null, warnings: [], error: 'Drop a .txt, .md, or .json file.' })
            return
        }
        let text
        try {
            text = await file.text()
        } catch {
            setResult({ recipe: null, source: null, warnings: [], error: "That file couldn't be read." })
            return
        }
        const parsed = parseRecipeImport(text)
        if (files.length > 1 && parsed.recipe) {
            parsed.warnings = [
                `${files.length} files dropped — imported the first ("${file.name}"). Add the rest one at a time.`,
                ...parsed.warnings,
            ]
        }
        setRaw(text)
        setResult(parsed)
    }

    const handleDragOver = (e) => { e.preventDefault(); setDragActive(true) }
    const handleDragLeave = (e) => {
        // Moving onto a child (the textarea) fires dragleave on the zone; only
        // clear when the pointer actually leaves the zone entirely.
        if (e.currentTarget.contains(e.relatedTarget)) return
        setDragActive(false)
    }
    const handleDrop = (e) => {
        e.preventDefault()
        setDragActive(false)
        importFile(e.dataTransfer.files)
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Import a recipe"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="bg-white border border-gray-200 rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Import a recipe</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1">
                    <p className="text-sm text-gray-600 mb-3">
                        Paste a recipe — plain text from any site or notes app, or recipe
                        JSON (a Digital Cookbook export works too). On a phone, tap the
                        keyboard's mic to dictate it. Preview what was detected, then fill
                        the form to review and edit before saving.
                    </p>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <textarea
                            ref={textareaRef}
                            value={raw}
                            onChange={handleChange}
                            aria-label="Recipe text to import"
                            placeholder={'Pasta alla Norma\nServes 4\n\nFor the sauce:\n2 tbsp olive oil\n1 large eggplant (cubed)\n…'}
                            className={`w-full h-52 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y ${dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300'}`}
                        />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                        {dragActive ? (
                            <span className="text-indigo-600 font-medium">Release to import…</span>
                        ) : (
                            <>
                                <span>Or drag a .txt, .md, or .json file here —</span>
                                <label className="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">
                                    choose a file
                                    <input
                                        type="file"
                                        accept=".txt,.md,.json"
                                        className="sr-only"
                                        onChange={(e) => { importFile(e.target.files); e.target.value = '' }}
                                    />
                                </label>
                            </>
                        )}
                    </div>

                    {result?.error && (
                        <p className="mt-3 text-sm text-red-600" role="alert">{result.error}</p>
                    )}
                    {result?.recipe && (
                        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
                            <p className="text-sm text-gray-800">
                                Detected from {SOURCE_LABELS[result.source]}:{' '}
                                <strong>{result.recipe.title ? `"${result.recipe.title}"` : 'Untitled'}</strong>
                                {' — '}{summarize(result.recipe)}
                            </p>
                            {result.warnings.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {result.warnings.map((w, i) => (
                                        <li key={i} className="text-xs text-amber-700">⚠ {w}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => setResult(parseRecipeImport(raw))}
                        disabled={raw.trim() === ''}
                        className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Preview
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(result.recipe)}
                        disabled={!result?.recipe}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Fill form
                    </button>
                </div>
            </div>
        </div>
    )
}
