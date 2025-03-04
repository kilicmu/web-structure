import { writeFileSync } from 'fs';
import { scraping } from '../src';

async function test() {
  try {
    // Basic usage
    const result = await scraping('https://example.com');
    console.log('Basic scraping result:', result);

    // Advanced usage with custom options
    const advancedResult = await scraping('https://example.com', {
      maxDepth: 1,
      selectors: {
        title: 'h1',
        description: 'p',
        links: 'a'
      },
      excludeChildPage: (url) => url.includes('privacy') || url.includes('terms'),
      withConsole: true,
      retryCount: 2,
      waitForSelectorTimeout: 5000
    });
    writeFileSync('test.json', JSON.stringify(advancedResult, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();