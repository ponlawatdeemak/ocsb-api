import { Controller, UseGuards, Get, Req, Res, Next } from '@nestjs/common'
import { ReverseProxyService } from './reverse-proxy.service'
import { AuthGuard } from 'src/core/auth.guard'
import { NextFunction, Request, Response } from 'express'

@UseGuards(AuthGuard)
@Controller('tiles')
export class ReverseProxyController {
	constructor(private readonly reverseProxyService: ReverseProxyService) {}

	@Get('*')
	proxyTileRequest(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
		res.setHeader('Cache-Control', 'public, max-age=3600')
		this.reverseProxyService.use(req, res, next)
	}
}
