import express from 'express';
import dns from 'dns';
import net from 'net';
import { GoogleGenAI } from '@google/genai';

export const aiAndProxyRouter = express.Router();

const MAX_PROXY_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIp(v4Part);
    }
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map((p) => parseInt(p, 10));
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local fc00::/7
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    return false;
  }

  return true;
}

async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid URL protocol');
  }

  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Disallowed URL port');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Disallowed target host');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('Disallowed private or loopback IP address');
    }
    return parsed;
  }

  const records = await dns.promises.lookup(hostname, { all: true });
  if (!records.length) {
    throw new Error('Unable to resolve target hostname');
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error('Target hostname resolves to a disallowed private or loopback IP');
    }
  }

  return parsed;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Image exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))}MB)`);
  }

  if (!response.body) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error(`Image exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))}MB)`);
    }
    return Buffer.from(ab);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Image exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))}MB)`);
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks);
}

// --- API ROUTE: Proxy image for 3D visualizer WebGL textures and image fallbacks to bypass CORS & referer blocking ---
aiAndProxyRouter.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    let fetchUrl = rawUrl;
    const driveMatch =
      fetchUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      fetchUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      fetchUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (driveMatch && driveMatch[1]) {
      const fileId = driveMatch[1];
      if (!fetchUrl.includes('lh3.googleusercontent.com')) {
        fetchUrl = `https://lh3.googleusercontent.com/d/${fileId}=s800`;
      } else if (fetchUrl.includes('=s1000')) {
        fetchUrl = fetchUrl.replace('=s1000', '=s800');
      }
    }

    let validatedUrl: URL;
    try {
      validatedUrl = await assertSafeExternalUrl(fetchUrl);
    } catch (validationErr: any) {
      return res.status(400).json({ error: validationErr.message || 'Disallowed URL' });
    }

    const requestHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    let response = await fetch(validatedUrl.toString(), { headers: requestHeaders });

    // If lh3 or primary URL returns non-200 or HTML (e.g. Google Drive warning page), try drive.google.com/uc export
    const initialContentType = response.headers.get('content-type') || '';
    if ((!response.ok || initialContentType.includes('text/html')) && driveMatch && driveMatch[1]) {
      const fallbackDriveUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
      const validatedFallback = await assertSafeExternalUrl(fallbackDriveUrl);
      const fallbackRes = await fetch(validatedFallback.toString(), { headers: requestHeaders });
      if (fallbackRes.ok) {
        const fbContentType = fallbackRes.headers.get('content-type') || '';
        if (fbContentType.startsWith('image/')) {
          response = fallbackRes;
        }
      }
    }

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Upstream image fetch failed with status ${response.status}` });
    }

    const contentType = (response.headers.get('content-type') || 'image/jpeg').toLowerCase();
    if (
      contentType.includes('text/html') ||
      (!contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream'))
    ) {
      return res.status(404).json({ error: 'Requested URL did not return an image' });
    }

    const buffer = await readResponseWithLimit(response, MAX_PROXY_IMAGE_BYTES);

    res.setHeader('Content-Type', contentType.startsWith('image/') ? contentType : 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return res.send(buffer);
  } catch (error: any) {
    const status = error.message?.includes('exceeds maximum allowed size') ? 413 : 500;
    return res.status(status).json({ error: error.message || 'Failed to proxy image' });
  }
});

// Helper lazy init for Gemini API
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

// --- API ROUTE: Scan Comic Cover Image with Gemini AI ---
aiAndProxyRouter.post('/api/scan-cover', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 data' });
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `
Analyze this comic book cover photo carefully and extract or estimate all details in raw JSON format with these exact keys:
{
  "title": "Comic Title (e.g. The Amazing Spider-Man)",
  "issueNumber": "Issue number or designation (e.g. 300, 1, Annual #2, TPB Vol 1)",
  "volume": "Volume identifier if visible (e.g. Vol. 1)",
  "publisher": "Publisher name (e.g. Marvel Comics, DC Comics, Image Comics, Dark Horse, BOOM! Studios)",
  "publicationYear": 1988 (number year estimate or exact),
  "genre": "Main Genre (e.g. Superhero, Sci-Fi, Horror, Fantasy, Crime, Mystery)",
  "writer": "Primary writer(s)",
  "artist": "Primary artist(s) or penciler/inker",
  "coverArtist": "Cover artist if known",
  "format": "Single Issue" | "Trade Paperback" | "Hardcover" | "Omnibus" | "Graphic Novel",
  "sizeThickness": 1.0 (number: 1.0 for single issue, 3.5 for trade paperback, 6.0 for hardcover, 12.0 for omnibus/compendium),
  "estimatedValue": 15.0 (estimated USD value based on title/issue/condition),
  "summary": "Brief 1-2 sentence description of the issue or cover scene",
  "tags": ["Key Issue", "First Appearance", "Marvel"]
}
Return ONLY valid JSON without markdown fences if possible or clean JSON.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
    });

    const responseText = response.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0]);
      return res.json({ success: true, data: parsedData });
    }

    return res.json({ success: true, rawText: responseText });
  } catch (err: any) {
    console.error('Scan Cover Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to scan comic cover' });
  }
});
