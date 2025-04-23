// reverse-proxy.service.ts
import { Injectable, NestMiddleware } from '@nestjs/common'
import { InternalServerErrorException } from '@nestjs/common/exceptions'
import { Request, Response, NextFunction } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

@Injectable()
export class ReverseProxyService implements NestMiddleware {
	private readonly proxy

	constructor() {
		// Configure the proxy to your Martin server
		this.proxy = createProxyMiddleware({
			target: process.env.PROXY_TILE_URL,
			changeOrigin: true, // For vhosts
			pathRewrite: (path) => {
				// You can modify the path before forwarding if needed
				return path
			},
			on: {
				// proxyReq: (proxyReq, req, res) => {
				// 	// Here you can add authentication headers or logic based on your chosen method
				// 	// Example: API Key in Header
				// 	// const apiKey = req.headers['x-api-key']
				// 	// if (!apiKey || apiKey !== 'your-secret-api-key') {
				// 	// 	// Reject the request if the API key is invalid
				// 	// 	res.writeHead(HttpStatus.UNAUTHORIZED, {
				// 	// 		'Content-Type': 'application/json',
				// 	// 	})
				// 	// 	res.end(JSON.stringify({ message: 'Unauthorized' }))
				// 	// 	proxyReq.destroy() // Abort the proxy request
				// 	// 	return
				// 	// }

				// 	// Example: Forwarding a session cookie (assuming session-based auth upstream)
				// 	// const sessionCookie = req.cookies['sessionId'];
				// 	// if (sessionCookie) {
				// 	//   proxyReq.setHeader('Cookie', `sessionId=${sessionCookie}`);
				// 	// }

				// 	// Log the outgoing request (optional)
				// 	console.log(`[Proxy] Forwarding ${req.method} ${req.url} to ${proxyReq.path}`)
				// },
				// proxyRes: (proxyRes, req, res) => {
				// 	// You can modify the response from Martin if needed
				// 	// console.log('[Proxy] Received response from Martin', proxyRes.statusCode);
				// },
				error: (err, req, res) => {
					console.error('[Proxy Error]', err)
					// res.writeHead(HttpStatus.INTERNAL_SERVER_ERROR, {
					// 	'Content-Type': 'application/json',
					// })
					// res.end(JSON.stringify({ message: 'Proxy Error' }))
					throw new InternalServerErrorException()
				},
			},
		})
	}

	use(req: Request, res: Response, next: NextFunction) {
		this.proxy(req, res, next)
	}
}
