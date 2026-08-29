import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(
  _req: IncomingMessage,
  res: ServerResponse
) {
  const memory = process.memoryUsage();
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: 'OK',
      platform: 'Vercel Serverless',
      memory: {
        rssMb: (memory.rss / 1024 / 1024).toFixed(2),
        heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMb: (memory.heapTotal / 1024 / 1024).toFixed(2),
      },
      timestamp: new Date().toISOString(),
    })
  );
}
