import { Controller, Get, UseGuards } from '@nestjs/common'
import { AppService } from './app.service'
import { ResponseDto } from '@interface/config/app.config'
import { AuthGuard } from 'src/core/auth.guard'

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get('/')
	@UseGuards(AuthGuard)
	getHello() {
		return new ResponseDto({ data: { name: 'test' } })
	}
}
