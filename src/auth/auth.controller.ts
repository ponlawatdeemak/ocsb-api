import { UserJwtPayload } from '@interface/auth.type'
import { ResponseDto } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import { LoginDtoIn, RefreshTokenDtoIn } from '@interface/dto/auth/auth.dto-in'
import { LoginDtoOut, RefreshTokenDtoOut } from '@interface/dto/auth/auth.dto-out'
import { UsersEntity } from '@interface/entities'
import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { hashPassword } from 'src/core/utils'
import { Repository } from 'typeorm'
@Controller('auth')
export class AuthController {
	private readonly accessTokenExpried = '1h'
	private readonly refreshTokenExpried = '1.5h'

	constructor(
		@InjectRepository(UsersEntity)
		private readonly userEntity: Repository<UsersEntity>,
	) {}

	@Post('/hash-password')
	async hashPassword(@Body() body) {
		const hashedPassword = await hashPassword(body.password)
		return new ResponseDto({ data: hashedPassword })
	}

	@Post('/login')
	async login(@Body() body: LoginDtoIn): Promise<ResponseDto<LoginDtoOut>> {
		const { email, password } = body
		const user = await this.userEntity.findOne({ where: { email } })
		if (!user) {
			throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		}
		const isPasswordValid = await bcrypt.compare(password, user.password)
		if (!isPasswordValid) {
			throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		}
		const paylod = {
			sub: user.userId,
			id: user.userId,
			email: user.email,
		}
		const accessToken = jwt.sign(paylod, process.env.JWT_SECRET, { expiresIn: this.accessTokenExpried })
		const refreshToken = jwt.sign(paylod, process.env.JWT_SECRET_REFRESH, {
			expiresIn: this.refreshTokenExpried,
		})

		return new ResponseDto({
			data: { id: user.userId, accessToken, refreshToken },
		})
	}

	@Post('/refresh-token')
	async refreshToken(@Body() body: RefreshTokenDtoIn): Promise<ResponseDto<RefreshTokenDtoOut>> {
		try {
			const data = jwt.verify(body.refreshToken, process.env.JWT_SECRET_REFRESH) as UserJwtPayload
			const user = await this.userEntity.findOne({ where: { userId: data.id } })
			if (!user) {
				throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)
			}
			const paylod = {
				sub: user.userId,
				id: user.userId,
				email: user.email,
			}

			const accessToken = jwt.sign(paylod, process.env.JWT_SECRET, { expiresIn: this.accessTokenExpried })
			const refreshToken = jwt.sign(paylod, process.env.JWT_SECRET_REFRESH, {
				expiresIn: this.refreshTokenExpried,
			})

			return new ResponseDto({ data: { accessToken, refreshToken } })
		} catch (error) {
			if (error.name === 'JsonWebTokenError') throw new UnauthorizedException(errorResponse.INVALID_TOKEN)
			if (error.name === 'TokenExpiredError') throw new UnauthorizedException(errorResponse.EXPIRED_TOKEN)
			throw error
		}
	}
}
