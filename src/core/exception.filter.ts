import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

@Catch()
export class AppExceptionsFilter implements ExceptionFilter {
	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost

		const ctx = host.switchToHttp()
		let httpStatus: number
		let errorRes: { title: string; message: string }

		if (exception instanceof HttpException) {
			httpStatus = exception.getStatus()
			const error = exception.getResponse() as any
			errorRes = {
				title: error.error,
				message: error.message,
			}
		} else {
			const error = exception as any
			console.error('exception: ', exception)
			httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
			errorRes = {
				title: 'Internal Server Error',
				message: error.message,
			}
		}

		httpAdapter.reply(ctx.getResponse(), { error: errorRes }, httpStatus)
	}
}
