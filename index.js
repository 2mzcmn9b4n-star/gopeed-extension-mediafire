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

    // Extract filename from title tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      fileName = titleMatch[1]
        .trim()
        .replace(/\s*\|\s*MediaFire\s*$/i, '')
        .replace(/[^a-zA-Z0-9._\- ]/g, '_')
        .trim();
    }

    // Method 1: Look for download button data attributes (modern MediaFire)
    const downloadButtonMatch = html.match(/data-url=["']([^"']+download[^"']+)["']/i);
    if (downloadButtonMatch) {
      directUrl = downloadButtonMatch[1];
      gopeed.logger.info('Found direct link via download button data-url');
    }

    // Method 2: Search for direct download server patterns
    if (!directUrl) {
      const directMatch = html.match(/https:\/\/download\d+\.mediafire\.com\/[a-zA-Z0-9_\-/]+/);
      if (directMatch) {
        directUrl = directMatch[0];
        gopeed.logger.info('Found direct link via download server pattern');
      }
    }

    // Method 3: Extract from a tags with download intent
    if (!directUrl) {
      const linkMatch = html.match(/<a[^>]+href=["']([^"']*mediafire\.com[^"']*download[^"']*)["'][^>]*>/i);
      if (linkMatch) {
        const href = linkMatch[1];
        if (href.startsWith('http')) {
          directUrl = href;
          gopeed.logger.info('Found direct link via download link tag');
        }
      }
    }

    // Method 4: Check for redirect/api endpoints that provide download info
    if (!directUrl) {
      const apiMatch = html.match(/https:\/\/[^\s"'<>]+(?:download|api|file)[^\s"'<>]+/gi);
      if (apiMatch) {
        // Filter for likely download URLs
        directUrl = apiMatch.find(url => 
          url.includes('download') || 
          url.includes('mediafire.com') && url.includes('/file/')
        );
        if (directUrl) {
          gopeed.logger.info('Found direct link via API/download endpoint');
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
      // Let Gopeed handle it as a regular link
    }
  } catch (error) {
    gopeed.logger.error(`Error resolving MediaFire link: ${error.message}`);
  }
});
