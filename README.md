# Web structure

A powerful and flexible web scraping library built with TypeScript and Puppeteer. It supports concurrent scraping, recursive crawling, and intelligent content extraction with DOM hierarchy awareness.

## Features

- **Concurrent Processing**: Parallel processing of multiple selectors and pages
- **DOM Hierarchy Aware**: Smart content extraction that respects DOM structure
- **Recursive Crawling**: Ability to crawl through child pages with depth control
- **Flexible Selectors**: Support for both single and multiple CSS selectors
- **Retry Mechanism**: Built-in retry with exponential backoff for reliability
- **Deduplication**: Automatic deduplication of content and URLs
- **Structured Output**: Clean, structured JSON output with metadata

## Installation

```bash
npm install web-structure
```

## Quick Start

```typescript
import { scraping } from 'web-structure';

// Basic usage
const result = await scraping('https://example.com');

// Advanced usage with options
const result = await scraping('https://example.com', {
  maxDepth: 2,
  selectors: {
    headings: ['h1', 'h2', 'h3'],
    content: '.article-content',
    links: 'a.important-link'
  },
  excludeChildPage: (url) => url.includes('login'),
  withConsole: true
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxDepth` | `number` | `0` | Maximum depth for recursive crawling |
| `excludeChildPage` | `(url: string) => boolean` | `() => false` | Function to determine if a URL should be skipped |
| `selectors` | `{ [key: string]: string \| string[] }` | See below | Selectors to extract content |
| `withConsole` | `boolean` | `true` | Whether to show console information |
| `breakWhenFailed` | `boolean` | `false` | Whether to break when a page fails |
| `retryCount` | `number` | `3` | Number of retries when scraping fails |
| `waitForSelectorTimeout` | `number` | `12000` | Timeout for waiting for a selector (ms) |
| `waitForPageLoadTimeout` | `number` | `12000` | Timeout for waiting for page load (ms) |

### Default Selectors

```typescript
{
  headings: ['h1', 'h2', 'h3', 'h4', 'h5'],
  paragraphs: 'p',
  articles: 'article',
  spans: 'span',
  orderLists: 'ol',
  lists: 'ul'
}
```

## Output Structure

```typescript
interface ScrapingResult {
  url: string;          // URL of the scraped page
  title: string;        // Page title
  data: {              // Extracted content
    [key: string]: string | string[];
  };
  timestamp: string;    // ISO timestamp of when the page was scraped
  childPages?: ScrapingResult[]; // Results from child pages (if maxDepth > 0)
}
```

## Advanced Features

### DOM Hierarchy Awareness

The library intelligently handles nested elements to prevent duplicate content. If a parent element is selected, its child elements won't be included separately in the results.

### Concurrent Processing

- Multiple selectors are processed concurrently
- Array selectors (e.g., `['h1', 'h2', 'h3']`) are processed in parallel
- Child pages are processed sequentially to prevent overwhelming the target server

### Retry Mechanism

Built-in retry mechanism with exponential backoff:
- Retries failed operations with increasing delays
- Configurable retry count
- Includes random jitter to prevent thundering herd problems

## Error Handling

The library provides robust error handling:
- Failed selector extractions don't stop the entire process
- Each selector and page has independent error handling
- Detailed error logging when `withConsole` is enabled
- Option to break on failures with `breakWhenFailed`

## Limitations

- Maximum crawling depth is limited to 10 levels
- Maximum of 5 child links per page are processed
- Respects robots.txt and rate limiting by default
- Requires JavaScript to be enabled on target pages

## License

MIT