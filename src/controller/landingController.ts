import axios from 'axios'
import { ref, type Ref } from 'vue'
import { useTheme } from '@/composables/useTheme'

export interface Feature {
  title: string
  description: string
  icon: string
}

export interface NavigationItem {
  label: string
  action: 'scroll' | 'navigate' | 'external'
  target: string
}

export interface CTAButton {
  label: string
  variant: 'elevated' | 'outlined' | 'text'
  color: string
  action: 'navigate' | 'external' | 'scroll'
  target: string
}

export interface LogoConfig {
  src: string
  alt: string
  width?: number
  height?: number
}

export interface NavbarConfig {
  title: string
  icon: string
  logo?: LogoConfig
  color: string
  elevation: number
  density: 'default' | 'prominent' | 'comfortable' | 'compact'
  navigationItems: NavigationItem[]
  ctaButton: CTAButton
}

export interface SocialLink {
  platform: string
  icon: string
  url: string
  label: string
}

export interface Technology {
  name: string
  icon: string
  color: string
}

export interface TeamMemberSocialLink {
  platform: string
  icon: string
  url: string
}

export interface TeamMember {
  name: string
  role: string
  avatar: string
  bio: string
  expertise: string[]
  email: string
  socialLinks: TeamMemberSocialLink[]
}

export interface ThesisTeamConfig {
  enabled: boolean
  title: string
  subtitle: string
  members: TeamMember[]
}

export interface FooterConfig {
  companyName: string
  tagline: string
  icon: string
  color: string
  copyright: string
  socialLinks: SocialLink[]
  technologies: Technology[]
  thesisTeam: ThesisTeamConfig
}

export interface UIConfig {
  showNavbar: boolean
  showFooter: boolean
  navbarComponent: '1' | '2' | '3' | '4'
  footerComponent: '1' | '2'
  navbar: NavbarConfig
  footer: FooterConfig
}

export interface ThemeConfig {
  primaryColor: string
  secondaryColor: string
}

export interface BackgroundImage {
  src: string
  alt: string
  overlay: {
    enabled: boolean
    color: string
    opacity: number
  }
}

export interface LandingData {
  title: string
  description: string
  subtitle: string
  backgroundImage: BackgroundImage
  features: Feature[]
  version: string
  author: string
  lastUpdated: string
  theme: ThemeConfig
  ui: UIConfig
}

export interface LandingController {
  data: Ref<LandingData | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchLandingData: () => Promise<void>
}

export function useLandingController (): LandingController {
  const data = ref<LandingData | null>(null)
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const { initializeTheme } = useTheme()

  const fetchLandingData = async (): Promise<void> => {
    try {
      loading.value = true
      error.value = null

      // Fetch both external-page.json and version-logs.json
      const [landingResponse, versionResponse] = await Promise.all([
        axios.get<LandingData>('/data/external-page.json', {
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        axios.get('/data/version-logs.json', {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ])

      data.value = landingResponse.data

      // Update version with the latest version from version-logs.json
      if (versionResponse.data?.versions && versionResponse.data.versions.length > 0) {
        const latestVersion = versionResponse.data.versions[0].version
        if (data.value) {
          data.value.version = latestVersion
        }
      }

      // Initialize dynamic theme from external-page.json
      if (data.value?.theme) {
        await initializeTheme()
      }
    } catch (error_) {
      console.error('Failed to fetch landing data:', error_)
      error.value = error_ instanceof Error ? error_.message : 'Unknown error occurred'

      data.value = null
    } finally {
      loading.value = false
    }
  }

  return {
    data,
    loading,
    error,
    fetchLandingData,
  }
}
