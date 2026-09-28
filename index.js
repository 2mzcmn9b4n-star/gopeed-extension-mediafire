gopeed.events.onResolve(async (ctx) => {
  const url = ctx.req.url;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      gopeed.logger.warn(`Failed to fetch MediaFire page: ${response.status}`);
      return;
    }

    const html = await response.text();
    let directUrl = null;
    let fileName = 'mediafire_file';
    let fileSize = 0;

    // Extract filename from URL (most reliable)
    const urlMatch = url.match(/\/([^/?#]+)$/);
    if (urlMatch) {
      fileName = decodeURIComponent(urlMatch[1])
        .replace(/[_]+/g, ' ')
        .trim();
    }

    // Extract filename from title tag as fallback
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && !fileName.includes('.')) {
      let titleText = titleMatch[1]
        .trim()
        .replace(/\s*[-|]\s*(?:Download|MediaFire)\s*$/i, '');
      
      if (titleText.includes('.')) {
        fileName = titleText
          .replace(/[_]+/g, ' ')
          .trim();
      }
    }

    // Method 1: Look for download button data attributes (modern MediaFire)
    const downloadButtonMatch = html.match(/data-url=["']([^"']+)["']/);
    if (downloadButtonMatch) {
      directUrl = downloadButtonMatch[1];
      gopeed.logger.info('Found direct link via download button data-url');
    }

    // Method 2: Search for direct download server patterns
    if (!directUrl) {
      const directMatch = html.match(/https:\/\/download\d+\.mediafire\.com\/[^\s"'<>]+/);
      if (directMatch) {
        directUrl = directMatch[0];
        gopeed.logger.info('Found direct link via download server pattern');
      }
    }

    // Method 3: Look for href with download in it
    if (!directUrl) {
      const hrefMatch = html.match(/href=["']([https:\/\/[^\s"'<>]*download[^\s"'<>]*)["']/i);
      if (hrefMatch) {
        const href = hrefMatch[1];
        if (href.startsWith('http')) {
          directUrl = href;
          gopeed.logger.info('Found direct link via href');
        }
      }
    }

    // Method 4: Generic URL extraction for download/api endpoints
    if (!directUrl) {
      const urlsInHtml = html.match(/https:\/\/[^\s"'<>]+/g);
      if (urlsInHtml) {
        for (let candidate of urlsInHtml) {
          if (candidate.includes('download') || candidate.includes('/file/')) {
            directUrl = candidate;
            gopeed.logger.info('Found direct link via URL pattern');
            break;
          }
        }
      }
    }

    if (directUrl) {
      // Attempt to get file size via HEAD request
      try {
        const headResponse = await fetch(directUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          redirect: 'follow'
        });

        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            fileSize = parseInt(contentLength, 10);
          }
        }
      } catch (e) {
        gopeed.logger.warn(`Could not get file size: ${e.message}`);
      }

      ctx.res = {
        name: fileName,
        files: [
          {
            name: fileName,
            size: fileSize,
            req: {
              url: directUrl,
            },
          },
        ],
      };

      gopeed.logger.info(`Resolved MediaFire link: ${fileName} (${fileSize} bytes)`);
    } else {
      gopeed.logger.warn(`Direct download link not found for: ${url}`);
    }
  } catch (error) {
    gopeed.logger.error(`Error resolving MediaFire link: ${error.message}`);
  }
});
