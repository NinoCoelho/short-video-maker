import { Request, Response } from "express";
import axios from "axios";
import { logger } from "../../logger";

export async function videoProxy(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: "Video URL is required" });
      return;
    }

    logger.info({ url }, "Proxying video request");

    // Parse the URL to handle special cases
    const parsedUrl = new URL(url);
    
    // Special handling for Coverr CDN URLs
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    };
    
    // Add referrer for CDN services that might require it
    if (parsedUrl.hostname.includes('coverr.co')) {
      headers['Referer'] = 'https://coverr.co/';
    } else if (parsedUrl.hostname.includes('pexels.com')) {
      headers['Referer'] = 'https://www.pexels.com/';
    } else if (parsedUrl.hostname.includes('pixabay.com')) {
      headers['Referer'] = 'https://pixabay.com/';
    }
    
    // Support range requests for video seeking
    const range = req.headers.range;
    if (range) {
      headers['Range'] = range;
    }
    
    // Fetch the video from the external URL
    const response = await axios.get(url, {
      responseType: 'stream',
      headers,
      timeout: 30000,
      maxRedirects: 10,
      validateStatus: (status) => status < 400 || status === 416, // Accept partial content
    });

    // Set appropriate headers
    const contentType = response.headers['content-type'] || 'video/mp4';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Add caching headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Pass through important headers
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    
    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
    }
    
    // Set appropriate status code
    res.status(response.status);

    // Handle client disconnection
    req.on('close', () => {
      logger.debug({ url }, "Client closed connection");
      response.data.destroy();
    });

    req.on('error', (error) => {
      logger.debug({ error, url }, "Request error");
      response.data.destroy();
    });

    // Stream the video to the client
    response.data.pipe(res);

    response.data.on('error', (error: any) => {
      // Only log actual errors, not client disconnections
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
        logger.error({ error, url }, "Error streaming video");
      }
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream video" });
      }
    });

    response.data.on('end', () => {
      logger.debug({ url }, "Video stream completed");
    });

  } catch (error) {
    logger.error({ error, url: req.query.url }, "Failed to proxy video");
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.statusText || "Failed to fetch video";
      res.status(status).json({ error: message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}