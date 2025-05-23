import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import { InjectRepository } from '@nestjs/typeorm'

import { Repository } from 'typeorm'
import { errorResponse } from '@interface/config/error.config'
import { UserJwtPayload, UserMeta } from '@interface/auth.type'
import { UsersEntity } from '@interface/entities'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly configService: ConfigService,

		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()

		const token = request.headers.authorization?.split('Bearer ')[1] || request.query.accessToken
		if (!token) throw new UnauthorizedException(errorResponse.INVALID_TOKEN)
		if (String(request.path).startsWith('/tiles')) {
			// if bypass db query for proxy request
			return true
		}
		try {
			const data = jwt.verify(token, this.configService.get('JWT_SECRET')) as UserJwtPayload
			if (!data && data.id) throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)
			const user = await this.userEntity.findOne({
				where: { userId: data.id, isDeleted: false },
				relations: ['role'],
				select: ['userId', 'isActive'],
			})

			if (!user) {
				throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)
			}
			if (!user.isActive) {
				throw new UnauthorizedException(errorResponse.USER_DISABLED)
			}
			const payload: UserMeta = {
				id: data.id,
				role: user.role,
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
