import { NestFactory, HttpAdapterHost } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'
import { AppExceptionsFilter } from './core/exception.filter'
import { ValidationPipe } from './core/validation.pipe'
import { TransformInterceptor } from './core/transform.interceptor'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	app.enableCors()
	const config = app.get<ConfigService>(ConfigService)
	const port = config.get<number>('PORT', 3001)
	const basePath = config.get<string>('BASE_PATH', '/')
	const { httpAdapter } = app.get(HttpAdapterHost)
	app.useGlobalFilters(new AppExceptionsFilter({ httpAdapter }))
	app.useGlobalPipes(new ValidationPipe())
	app.useGlobalInterceptors(new TransformInterceptor())

	app.setGlobalPrefix(basePath)
	await app.listen(port)
	console.log('[WEB]', `http://localhost:${port}${basePath}`)
}
bootstrap()
