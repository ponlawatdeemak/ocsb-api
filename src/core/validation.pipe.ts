import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
	async transform(value: any, { metatype }: ArgumentMetadata) {
		const object = plainToInstance(metatype, value)
		const errors = await validate(object)
		if (errors.length > 0) {
			throw new BadRequestException('Validation failed')
		}
		return value
	}
}
