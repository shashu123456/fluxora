/**
 * Curated API catalog. Every entry is GET-only, HTTPS-only, and was checked
 * against the provider's public documentation before being added.
 *
 * Rules:
 * - No invented quotas. If a limit is not published, say so.
 * - `verifiedAt` is the date the entry was last checked by a human.
 * - `sample.path` is always relative; the executor joins it to `baseUrl`.
 * - Real credentials never appear here, in examples, or in tests.
 */

export type ApiAuth =
  | { type: 'none' }
  | { type: 'header'; name: string; prefix?: string }
  | { type: 'query'; name: string }

export type ApiRisk = 'low' | 'medium' | 'high'

export type ApiCategory =
  | 'Developer Tools'
  | 'Data & Reference'
  | 'Weather & Geo'
  | 'Finance'
  | 'AI & Models'
  | 'Productivity'

export interface ApiCatalogEntry {
  id: string
  name: string
  category: ApiCategory
  description: string
  docsUrl: string
  baseUrl: string
  auth: ApiAuth
  freeTier: string
  risk: ApiRisk
  tags: string[]
  verifiedAt: string
  sample: {
    method: 'GET'
    path: string
    query?: Record<string, string>
  }
  responseNotes: string
}

export const CATALOG_VERSION = '1.0.0'
export const CATALOG_VERIFIED_AT = '2026-11-06'

export const API_CATALOG: ReadonlyArray<ApiCatalogEntry> = [
  {
    id: 'github-rest',
    name: 'GitHub REST',
    category: 'Developer Tools',
    description: 'Repository, issue, and user metadata for public GitHub projects.',
    docsUrl: 'https://docs.github.com/en/rest',
    baseUrl: 'https://api.github.com',
    auth: { type: 'none' },
    freeTier: '60 requests/hour unauthenticated; 5,000/hour with a token.',
    risk: 'low',
    tags: ['git', 'repositories', 'issues', 'open source'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/repos/octocat/Hello-World' },
    responseNotes: 'Repository object with stars, language, license, and timestamps.',
  },
  {
    id: 'npm-registry',
    name: 'npm Registry',
    category: 'Developer Tools',
    description: 'Package metadata for anything published to npm.',
    docsUrl: 'https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md',
    baseUrl: 'https://registry.npmjs.org',
    auth: { type: 'none' },
    freeTier: 'No published request quota. Cache responses and avoid bulk crawling.',
    risk: 'low',
    tags: ['npm', 'packages', 'javascript', 'versions'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/react' },
    responseNotes: 'Very large document: dist-tags, every version, maintainers, and readme.',
  },
  {
    id: 'pypi-json',
    name: 'PyPI JSON',
    category: 'Developer Tools',
    description: 'Package metadata and release files for Python packages on PyPI.',
    docsUrl: 'https://docs.pypi.org/api/json/',
    baseUrl: 'https://pypi.org',
    auth: { type: 'none' },
    freeTier: 'No published quota. PyPI asks clients to cache and identify themselves.',
    risk: 'low',
    tags: ['python', 'packages', 'pypi', 'releases'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/pypi/requests/json' },
    responseNotes: 'Package info plus a releases map with upload times and file URLs.',
  },
  {
    id: 'dev-community',
    name: 'DEV Community',
    category: 'Developer Tools',
    description: 'Public developer articles and tags from the DEV (Forem) community.',
    docsUrl: 'https://developers.forem.com/api',
    baseUrl: 'https://dev.to',
    auth: { type: 'none' },
    freeTier: 'Reading published articles requires no key.',
    risk: 'low',
    tags: ['articles', 'blog', 'community', 'writing'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/api/articles', query: { per_page: '1' } },
    responseNotes: 'Array of article summaries with author, tags, and reaction counts.',
  },
  {
    id: 'jsonplaceholder',
    name: 'JSONPlaceholder',
    category: 'Developer Tools',
    description: 'Fake REST data for prototyping: posts, comments, users, todos.',
    docsUrl: 'https://jsonplaceholder.typicode.com/',
    baseUrl: 'https://jsonplaceholder.typicode.com',
    auth: { type: 'none' },
    freeTier: 'Free demo service. Not intended for production data.',
    risk: 'low',
    tags: ['mock', 'testing', 'prototype', 'rest'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/posts/1' },
    responseNotes: 'A single post object: userId, id, title, body.',
  },
  {
    id: 'stackexchange',
    name: 'StackExchange',
    category: 'Developer Tools',
    description: 'Questions, answers, and tags from Stack Overflow and the wider network.',
    docsUrl: 'https://api.stackexchange.com/docs',
    baseUrl: 'https://api.stackexchange.com',
    auth: { type: 'none' },
    freeTier: '300 requests/day per IP without a key; 10,000/day with a registered key.',
    risk: 'low',
    tags: ['questions', 'stackoverflow', 'answers', 'tags'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: {
      method: 'GET',
      path: '/2.3/questions',
      query: { site: 'stackoverflow', pagesize: '1', order: 'desc', sort: 'activity' },
    },
    responseNotes: 'Wrapped in `items`, with `quota_remaining` and `backoff` fields to respect.',
  },
  {
    id: 'worldbank',
    name: 'World Bank Data',
    category: 'Data & Reference',
    description: 'Country and indicator data published by the World Bank.',
    docsUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392',
    baseUrl: 'https://api.worldbank.org',
    auth: { type: 'none' },
    freeTier: 'No key required. No published per-request quota; keep request volume modest.',
    risk: 'low',
    tags: ['countries', 'economics', 'indicators', 'reference'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/v2/country/IND', query: { format: 'json' } },
    responseNotes: 'Two-element array: paging metadata, then an array of country records.',
  },
  {
    id: 'open-library',
    name: 'Open Library',
    category: 'Data & Reference',
    description: 'Book and author search across the Internet Archive catalog.',
    docsUrl: 'https://openlibrary.org/developers/api',
    baseUrl: 'https://openlibrary.org',
    auth: { type: 'none' },
    freeTier: 'No key required. Be polite: cache and identify your client.',
    risk: 'low',
    tags: ['books', 'authors', 'library', 'search'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/search.json', query: { q: 'the hobbit', limit: '1' } },
    responseNotes: 'Search document with `numFound` and a `docs` array of editions.',
  },
  {
    id: 'wikipedia-rest',
    name: 'Wikipedia REST',
    category: 'Data & Reference',
    description: 'Article summaries and page metadata from Wikipedia.',
    docsUrl: 'https://en.wikipedia.org/api/rest_v1/',
    baseUrl: 'https://en.wikipedia.org',
    auth: { type: 'none' },
    freeTier: 'No key required. Wikimedia asks for a descriptive User-Agent.',
    risk: 'low',
    tags: ['encyclopedia', 'summary', 'reference', 'articles'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/api/rest_v1/page/summary/Electron_(software)' },
    responseNotes: 'Summary text, thumbnail, and content URLs for one page.',
  },
  {
    id: 'dog-ceo',
    name: 'Dog CEO',
    category: 'Data & Reference',
    description: 'Random dog images by breed, plus the full breed list.',
    docsUrl: 'https://dog.ceo/dog-api/documentation/',
    baseUrl: 'https://dog.ceo',
    auth: { type: 'none' },
    freeTier: 'No key required. No published quota.',
    risk: 'low',
    tags: ['images', 'animals', 'random', 'demo'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/api/breeds/image/random' },
    responseNotes: 'One object with a `message` image URL and `status: success`.',
  },
  {
    id: 'thecatapi',
    name: 'TheCatAPI',
    category: 'Data & Reference',
    description: 'Cat images and breed metadata with filtering.',
    docsUrl: 'https://developers.thecatapi.com/',
    baseUrl: 'https://api.thecatapi.com',
    auth: { type: 'header', name: 'x-api-key' },
    freeTier: 'Limited anonymous use; a free key raises rate limits. Limits are not published as a fixed number.',
    risk: 'medium',
    tags: ['images', 'animals', 'breeds'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/v1/images/search', query: { limit: '1' } },
    responseNotes: 'Array of image objects with URL, width, height, and optional breed data.',
  },
  {
    id: 'open-meteo-forecast',
    name: 'Open-Meteo Forecast',
    category: 'Weather & Geo',
    description: 'Hourly and current weather for any latitude and longitude.',
    docsUrl: 'https://open-meteo.com/en/docs',
    baseUrl: 'https://api.open-meteo.com',
    auth: { type: 'none' },
    freeTier: 'No key required for non-commercial use. Published limits apply per IP.',
    risk: 'low',
    tags: ['weather', 'forecast', 'temperature', 'geo'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: {
      method: 'GET',
      path: '/v1/forecast',
      query: { latitude: '12.9716', longitude: '77.5946', current: 'temperature_2m' },
    },
    responseNotes: 'Current values plus units and timezone, in a compact JSON body.',
  },
  {
    id: 'open-meteo-geocoding',
    name: 'Open-Meteo Geocoding',
    category: 'Weather & Geo',
    description: 'Resolve a place name to coordinates, country, and timezone.',
    docsUrl: 'https://open-meteo.com/en/docs/geocoding-api',
    baseUrl: 'https://geocoding-api.open-meteo.com',
    auth: { type: 'none' },
    freeTier: 'No key required. No published per-request quota.',
    risk: 'low',
    tags: ['geocoding', 'places', 'coordinates', 'search'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/v1/search', query: { name: 'Bengaluru', count: '1' } },
    responseNotes: 'Results array with latitude, longitude, country, and timezone.',
  },
  {
    id: 'usgs-earthquake',
    name: 'USGS Earthquake',
    category: 'Weather & Geo',
    description: 'Recent earthquakes worldwide, with magnitude, depth, and place.',
    docsUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    baseUrl: 'https://earthquake.usgs.gov',
    auth: { type: 'none' },
    freeTier: 'No key required. USGS asks for reasonable request volume.',
    risk: 'low',
    tags: ['earthquakes', 'geoscience', 'seismic', 'geojson'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: {
      method: 'GET',
      path: '/fdsnws/event/1/query',
      query: { format: 'geojson', limit: '1', orderby: 'time' },
    },
    responseNotes: 'GeoJSON FeatureCollection with magnitude, place, and event time.',
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter',
    category: 'Finance',
    description: 'Exchange rates from the European Central Bank, no key required.',
    docsUrl: 'https://frankfurter.dev/',
    baseUrl: 'https://api.frankfurter.dev',
    auth: { type: 'none' },
    freeTier: 'Free and keyless. Rates are published once per working day.',
    risk: 'low',
    tags: ['currency', 'exchange rates', 'forex', 'ecb'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/v1/latest', query: { from: 'USD', to: 'INR' } },
    responseNotes: 'Base currency, date, and a rates object with one entry per target.',
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: 'Finance',
    description: 'Cryptocurrency prices, market caps, and volume.',
    docsUrl: 'https://docs.coingecko.com/',
    baseUrl: 'https://api.coingecko.com',
    auth: { type: 'header', name: 'x-cg-demo-api-key' },
    freeTier: 'Demo key: 30 calls/minute and 10,000 calls/month, per CoinGecko documentation.',
    risk: 'medium',
    tags: ['crypto', 'prices', 'market cap', 'coins'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: {
      method: 'GET',
      path: '/api/v3/simple/price',
      query: { ids: 'bitcoin', vs_currencies: 'usd' },
    },
    responseNotes: 'Nested price object keyed by coin id and currency.',
  },
  {
    id: 'huggingface-hub',
    name: 'Hugging Face Hub',
    category: 'AI & Models',
    description: 'Search public models, datasets, and model metadata.',
    docsUrl: 'https://huggingface.co/docs/api-inference/index',
    baseUrl: 'https://huggingface.co',
    auth: { type: 'header', name: 'Authorization', prefix: 'Bearer ' },
    freeTier: 'Free account and token. Rate limits vary by endpoint and are not fixed in public docs.',
    risk: 'low',
    tags: ['models', 'datasets', 'ml', 'hub'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/api/models', query: { limit: '1' } },
    responseNotes: 'Array of model records with id, downloads, likes, and tags.',
  },
  {
    id: 'openrouter-models',
    name: 'OpenRouter Models',
    category: 'AI & Models',
    description: 'Public list of available models with context length and pricing.',
    docsUrl: 'https://openrouter.ai/docs',
    baseUrl: 'https://openrouter.ai',
    auth: { type: 'none' },
    freeTier: 'Listing models needs no key. Calling a model requires an account and credits.',
    risk: 'low',
    tags: ['llm', 'models', 'pricing', 'context'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/api/v1/models' },
    responseNotes: 'Model list with ids, context length, and per-token pricing.',
  },
  {
    id: 'hackernews-firebase',
    name: 'Hacker News',
    category: 'Productivity',
    description: 'Top stories and item details from the Hacker News Firebase API.',
    docsUrl: 'https://github.com/HackerNews/API',
    baseUrl: 'https://hacker-news.firebaseio.com',
    auth: { type: 'none' },
    freeTier: 'Keyless and free. Very high request volume is discouraged.',
    risk: 'low',
    tags: ['news', 'stories', 'reading', 'tech'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/v0/topstories.json' },
    responseNotes: 'Array of numeric item ids; each id needs a second request for details.',
  },
  {
    id: 'google-books',
    name: 'Google Books',
    category: 'Productivity',
    description: 'Search the Google Books catalog for volumes and metadata.',
    docsUrl: 'https://developers.google.com/books/docs/v1/using',
    baseUrl: 'https://www.googleapis.com',
    auth: { type: 'none' },
    freeTier: 'Basic volume search works without a key; published quotas apply to the project.',
    risk: 'low',
    tags: ['books', 'search', 'reading', 'volumes'],
    verifiedAt: CATALOG_VERIFIED_AT,
    sample: { method: 'GET', path: '/books/v1/volumes', query: { q: 'electron', maxResults: '1' } },
    responseNotes: '`totalItems` plus an `items` array with volume info and links.',
  },
]

export function findCatalogEntry(apiId: string): ApiCatalogEntry | undefined {
  return API_CATALOG.find((entry) => entry.id === apiId)
}

export const CATALOG_CATEGORIES: ReadonlyArray<ApiCategory> = [
  'Developer Tools',
  'Data & Reference',
  'Weather & Geo',
  'Finance',
  'AI & Models',
  'Productivity',
]
