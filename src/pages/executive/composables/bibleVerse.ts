/**
 * Composable for fetching a random Bible verse from an external API.
 * Uses the free bible-api.com service (no API key required).
 */

export interface BibleVerse {
  reference: string
  text: string
  book: string
  chapter: number
  verse: number
}

export async function fetchRandomVerse(): Promise<BibleVerse | null> {
  try {
    const response = await fetch('https://bible-api.com/?random=verse')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      reference: data.reference ?? '',
      text: data.text ?? '',
      book: data.verses?.[0]?.book ?? '',
      chapter: data.verses?.[0]?.chapter ?? 0,
      verse: data.verses?.[0]?.verse ?? 0,
    }
  } catch (error) {
    console.error('Failed to fetch bible verse:', error)
    return null
  }
}