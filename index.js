gopeed.events.onResolve(async (ctx) => {
  const url = ctx.req.url;

  const normalizeFileName = (rawName) => {
    if (!rawName) return 'mediafire_file';

    let name = decodeURIComponent(rawName)
      .split('?')[0]
      .replace(/\\/g, '/');

    name = name.replace(/^.*\//, '');

    const lastDot = name.lastIndexOf('.');
    const hasExtension = lastDot > 0 && lastDot < name.length - 1;
    let ext = '';

    if (hasExtension) {
      ext = name.slice(lastDot);
      name = name.slice(0, lastDot);
    }

    name = name
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*\|\s*MediaFire\s*$/i, '')
      .replace(/\s*[-–—]\s*(?:Download|MediaFire)\s*$/i, '')
      .replace(/[<>:"/|?*]+/g, ' ')
      .trim();

    if (!name) {
      name = 'mediafire_file';
    }

    name = name
      .replace(/\s*\(\s*/g, ' (')
      .replace(/\s*\)\s*/g, ') ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const finalName = `${name}${ext}`.trim();
    return finalName || 'mediafire_file';
  };

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

    const urlFileName = (() => {
      const match = url.match(/\/([^/?#]+)$/);
      return match ? normalizeFileName(match[1]) : '';
    })();

    if (urlFileName) {
      fileName = urlFileName;
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const titleText = titleMatch[1].trim();
      const cleanedTitle = titleText
        .replace(/\s*[-|]\s*(?:Download|MediaFire)\s*$/i, '')
        .trim();

      if (cleanedTitle && cleanedTitle.toLowerCase() !== 'mediafire') {
        const titleFileName = normalizeFileName(cleanedTitle);
        if (titleFileName && titleFileName !== 'mediafire_file') {
          fileName = titleFileName;
        }
      }
    }

    const downloadButtonMatch = html.match(/data-url=["']([^"']+download[^"']+)["']/i);
    if (downloadButtonMatch) {
      directUrl = downloadButtonMatch[1];
      gopeed.logger.info('Found direct link via download button data-url');
    }

    if (!directUrl) {
      const directMatch = html.match(/https:\/\/download\d+\.mediafire\.com\/[a-zA-Z0-9_\-/]+/);
      if (directMatch) {
        directUrl = directMatch[0];
        gopeed.logger.info('Found direct link via download server pattern');
      }
    }

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

    if (!directUrl) {
      const apiMatch = html.match(/https:\/\/[^\s"'<>]+(?:download|api|file)[^\s"'<>]+/gi);
      if (apiMatch) {
        directUrl = apiMatch.find(candidate => 
          candidate.includes('download') ||
          (candidate.includes('mediafire.com') && candidate.includes('/file/'))
        );
        if (directUrl) {
          gopeed.logger.info('Found direct link via API/download endpoint');
        }
      }
    }

    if (directUrl) {
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
