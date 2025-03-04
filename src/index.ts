import { writeFileSync } from 'fs';
import puppeteer from 'puppeteer';
import { URL } from 'url';

interface ScrapingResult {
  url: string;
  title: string;
  data: any;
  timestamp: string;
  childPages?: ScrapingResult[];
}

const MAX_DEEPEST_DEPTH = 10;

export interface ScrapingOptions {
  /**
   * @description Maximum depth for recursive crawling. If a page contains child links, they will be crawled by default.
   * The more child links, the slower the crawling process.
   * @default 0
   */
  maxDepth?: number;
  // A function to determine if a URL should be excluded. If it returns true, the URL will be skipped
  excludeChildPage?: (url: string) => boolean;
  /**
   * @description Selectors to extract content from the page.
   * @default {
      headings: ['h1', 'h2', 'h3', 'h4', 'h5'],
      paragraphs: 'p',
      articles: 'article',
      spans: 'span',
      orderLists: 'ol',
      lists: 'ul',
    }
   */
  selectors?: { [key: string]: string | string[] };
  /**
   * @description Whether to show console information
   * @default true
   */
  withConsole?: boolean,
  /**
   * @description Whether to break when a page fails
   * @default false
   */
  breakWhenFailed?: boolean,
  /**
   * @description Number of retries when scraping a page fails
   * @default 3
   */
  retryCount?: number,
  /**
   * @description Timeout for waiting for a selector to be present
   * @default 12000
   *  */
  waitForSelectorTimeout?: number,
  /**
   * @description Timeout for waiting for a page to load
   * @default 12000
   *  */
  waitForPageLoadTimeout?: number,
}

const DefaultScrapingOptions: Required<ScrapingOptions> = {
  maxDepth: 0,
  selectors: {
    headings: ['h1', 'h2', 'h3', 'h4', 'h5'],
    paragraphs: 'p',
    articles: 'article',
    spans: 'span',
    orderLists: 'ol',
    lists: 'ul',
  },
  excludeChildPage: () => false,
  withConsole: true,
  breakWhenFailed: false,
  retryCount: 3,
  waitForSelectorTimeout: 12000,
  waitForPageLoadTimeout: 12000
}

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

function isSameDomain(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return base.hostname === target.hostname;
  } catch {
    return false;
  }
}

async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        // Exponential backoff with jitter
        const backoffDelay = delay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}

async function scrapeWebPage(
  url: string,
  options: Required<ScrapingOptions> & { logger: (message: string) => void },
  currentDepth: number = 0,
  visitedUrls: Set<string> = new Set()
): Promise<ScrapingResult> {
  // Prevent infinite loops by tracking visited URLs
  if (visitedUrls.has(url)) {
    return {
      url,
      title: "Already visited",
      data: {},
      timestamp: new Date().toISOString()
    };
  }
  visitedUrls.add(url);

  const browser = await puppeteer.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();

    options.logger(`prepare loading ${url}...`)

    // Navigate to the page and wait until network is idle
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: options.waitForPageLoadTimeout
    });

    // Get page title
    const title = await page.title();

    // Extract data based on provided selectors
    const data: { [key: string]: string | string[] } = {};

    const entrys = Object.entries(options.selectors)
    // Process all selectors concurrently
    const selectorPromises = entrys.map(
      async ([key, selector]): Promise<[string, string | string[]]> => {
        try {
          const elements = await retry(async () => {
            const selectors = Array.isArray(selector) ? selector : [selector];

            // Process all selectors in parallel
            const selectorResults = await Promise.allSettled(
              selectors.map(async (singleSelector) => {
                options.logger(`waiting for selector ${singleSelector}...`)
                await page.waitForSelector(singleSelector, { timeout: options.waitForSelectorTimeout });

                // Extract elements while respecting DOM hierarchy
                const extractedElements = await page.$$eval(singleSelector, (els) => {
                  // Filter out elements that are descendants of already selected elements
                  const filteredEls = els.filter(el => {
                    // Check if any ancestor of this element is also in our selection
                    let parent = el.parentElement;
                    while (parent) {
                      if (els.includes(parent)) {
                        return false; // Skip this element as its parent is already selected
                      }
                      parent = parent.parentElement;
                    }
                    return true;
                  });

                  // Get text content of filtered elements
                  return filteredEls.map(el => {
                    // Get all text content, including from child nodes
                    return el.textContent?.trim().replace(/\s+/g, ' ') || '';
                  }).filter(Boolean); // Remove empty strings
                });

                return extractedElements;
              })
            );

            // Combine and deduplicate results from all selectors
            const allElements = selectorResults.map(res => res.status === 'fulfilled' ? res.value : []).flat();
            return [...new Set(allElements)];
          }, options.retryCount);

          return [key, elements.length === 1 ? elements[0] : elements];
        } catch (error) {
          options.logger(`Failed to extract ${key} with selector ${selector} after all retries: ${error}`);
          return [key, ''];
        }
      }
    );

    // Wait for all selectors to be processed
    const results = await Promise.allSettled<[string, string | string[]]>(selectorPromises);

    // Convert results back to object
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        const msg = `Failed to extract ${entrys[idx][0]} with selector ${entrys[idx][1]}`
        options.logger(msg);
        if (options.breakWhenFailed) {
          throw new Error(msg);
        }
        return;
      };
      const [key, value] = res.value
      data[key] = value;
    });


    // Get all links from the page
    const links = await page.$$eval('a', (anchors) =>
      anchors.map(a => a.href).filter(href => href && href.startsWith('http'))
    );

    // Remove duplicates from links
    const uniqueLinks = [...new Set(links)];

    options.logger(`found ${uniqueLinks.length} links. Links: ${uniqueLinks.join(', ')}`)

    // Recursively scrape child pages if we haven't reached max depth
    const childPages: ScrapingResult[] = [];
    if (currentDepth < options.maxDepth) {
      const validLinks = uniqueLinks
        .filter(link =>
          isValidUrl(link) &&
          !visitedUrls.has(link) &&
          (options.excludeChildPage ? options.excludeChildPage(link) : isSameDomain(url, link))
        )

      for (const link of validLinks) {
        options.logger(`scraping ${link}...`)
        try {
          const childResult = await scrapeWebPage(
            link,
            options,
            currentDepth + 1,
            visitedUrls
          );
          childPages.push(childResult);
        } catch (error) {
          options.logger(`Error scraping child page ${link}: ${error}`);
          if (options.breakWhenFailed) {
            throw error;
          }
        }
      }
    }

    return {
      url,
      title,
      data,
      timestamp: new Date().toISOString(),
      childPages: childPages.length > 0 ? childPages : undefined
    };

  } finally {
    await browser.close();
  }
}

export async function scraping(url: string, _options: ScrapingOptions = {}) {
  const options = Object.assign({}, DefaultScrapingOptions, _options);
  if (options.maxDepth > MAX_DEEPEST_DEPTH) {
    throw new Error('Max depth exceeds the maximum depth')
  }
  const logger = (message: string) => {
    options.withConsole &&
      console.log(message);
  }

  try {
    return await scrapeWebPage(url, {
      ...options,
      logger
    });
  } catch (error) {
    throw error
  }
}