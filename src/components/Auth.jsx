import { useAuthForm } from './auth/useAuthForm'
import { AUTH_STYLES } from './auth/styles'

// Active Auth visual style. To swap styles later, add a new component under
// src/components/auth/styles/, register it in styles/index.js, and change
// this constant. See refs/COSMETICS.md "Login Experience" for the style
// catalog and roadmap.
const ACTIVE_AUTH_STYLE = 'book-cover-composition'

export default function Auth({ onBack }) {
    const form = useAuthForm()
    const StyleComponent = AUTH_STYLES[ACTIVE_AUTH_STYLE]
    return <StyleComponent form={form} onBack={onBack} />
}
