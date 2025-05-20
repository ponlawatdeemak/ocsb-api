import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
	@Get('version')
	getVersion() {
		console.log('👻 version: ')
		return { version: '0.0.1' }
	}
}
