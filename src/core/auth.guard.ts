import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import { InjectRepository } from '@nestjs/typeorm'
// import { UserEntity } from '@interface/entities'
import { Repository } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'
import { UserJwtPayload, UserMeta } from '@interface/auth.type'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly configService: ConfigService,

		// @InjectRepository(UserEntity)
		// private readonly userEntity: Repository<UserEntity>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()

		const token = request.headers.authorization?.split('Bearer ')[1]
		if (!token) throw new UnauthorizedException(errorResponse.INVALID_TOKEN)

		try {
			const data = jwt.verify(token, this.configService.get('JWT_SECRET')) as UserJwtPayload

			// const user = await this.userEntity.findOne({
			// 	where: { id: data.id, isDeleted: false },
			// })
			const user = {
				username: 'test',
				isDisabled: false,
			}
			if (!user) throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)

			if (user.isDisabled === true) throw new UnauthorizedException(errorResponse.USER_DISABLED)

			const payload: UserMeta = {
				id: data.id,
			}
			request.user = payload
			return true
		} catch (error) {
			if (error.name === 'JsonWebTokenError') throw new UnauthorizedException(errorResponse.INVALID_TOKEN)
			if (error.name === 'TokenExpiredError') throw new UnauthorizedException(errorResponse.EXPIRED_TOKEN)

			if (error.message === errorResponse.USER_NOT_FOUND)
				throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)

			if (error.message === errorResponse.USER_DISABLED)
				throw new UnauthorizedException(errorResponse.USER_DISABLED)

			return false
		}
	}
}
