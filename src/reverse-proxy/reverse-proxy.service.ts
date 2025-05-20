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
			target: process.env.PROXY_TILE_URL || 'https://43.208.227.58:30002',
			changeOrigin: true, // For vhosts
			pathRewrite: (path) => {
				return path.replace('/tiles', '')
			},
			on: {
				error: (err) => {
					console.error('[Proxy Error]', err)

					throw new InternalServerErrorException()
				},
			},
		})
	}

	use(req: Request, res: Response, next: NextFunction) {
		this.proxy(req, res, next)
	}
}
