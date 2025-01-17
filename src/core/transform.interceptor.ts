import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface Response<T> {
	data: T
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
	intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
		// const request = context.switchToHttp().getRequest()
		// if (request?.url === '/api/report/download') {
		// 	return next.handle().pipe()
		// }

		return next
			.handle()
			.pipe(map((data) => ({ total: data.total, data: data.data, type: data.type, features: data.features })))
	}
}
