import axios from 'axios'
import { ref, type Ref } from 'vue'

export interface QuoteContent {
  text: string
  author: string
  source?: string
  motivationalText?: string
}

export interface SocialLoginOption {
  provider: string
  icon: string
  label: string
  enabled: boolean
  color?: string
}

export interface AuthPageConfig {
  title: string
  subtitle?: string
  quote: QuoteContent
  socialLoginOptions: SocialLoginOption[]
  layout?: {
    quotePosition: 'left' | 'right'
  }
  features?: {
    enableModeToggle: boolean
    enableSocialLogin: boolean
    enableBackToHome: boolean
  }
  backgroundImage?: {
    src: string
    alt: string
    overlay?: {
      enabled: boolean
      color: string
      opacity: number
    }
  }
}

export interface ExternalPageData {
  title: string
  description: string
  subtitle: string
  // ... other existing properties from external-page.json
  authPage?: AuthPageConfig
}

export interface AuthPageController {
  data: Ref<AuthPageConfig | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchAuthPageData: () => Promise<void>
}

export function useAuthPageController(): AuthPageController {
  const data = ref<AuthPageConfig | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchAuthPageData = async () => {
    try {
      loading.value = true
      error.value = null

      const response = await axios.get<ExternalPageData>('/data/external-page.json')

      // Extract auth page configuration directly from JSON
      data.value = response.data.authPage || null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch auth page data'
      console.error('Auth page data fetch error:', err)
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, fetchAuthPageData }
}
