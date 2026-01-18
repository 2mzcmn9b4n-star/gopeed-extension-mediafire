gopeed.events.onResolve(async (ctx) => {
  const url = ctx.req.url;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();
    // Ищем прямую ссылку на скачивание
    let match = html.match(/https:\/\/download\d+\.mediafire\.com\/[^"'\s]+/);
    if (!match) {
      // Fallback: искать в href download
      match = html.match(/href="([^"]*download[^"]*)"/i);
      if (match && match[1].startsWith('http')) {
        match = [match[1]];
      } else {
        match = null;
      }
    }
    if (match) {
      const directUrl = match[0];
      // Извлекаем имя файла из title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      let name = 'mediafire_file';
      if (titleMatch) {
        name = titleMatch[1].trim().replace(' | MediaFire', '').replace(/[^a-zA-Z0-9._-]/g, '_');
      }
      // Получаем размер файла
      let size = 0;
      try {
        const headResponse = await fetch(directUrl, { method: 'HEAD' });
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          size = parseInt(contentLength, 10);
        }
      } catch (e) {
        gopeed.logger.warn('Could not get file size: ' + e.message);
      }
      ctx.res = {
        name: name,
        files: [
          {
            name: name,
            size: size,
            req: {
              url: directUrl,
            },
          },
        ],
      };
    } else {
      gopeed.logger.warn('Direct download link not found for: ' + url);
      // Fallback: не устанавливать ctx.res, Gopeed обработает как обычную ссылку
    }
  } catch (error) {
    gopeed.logger.error('Error resolving MediaFire link: ' + error.message);
  }
});