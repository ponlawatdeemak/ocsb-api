import { UserJwtPayload } from '@interface/auth.type'
import { ResponseDto } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import { LoginDtoIn, RefreshTokenDtoIn } from '@interface/dto/auth/auth.dto-in'
import { LoginDtoOut, RefreshTokenDtoOut } from '@interface/dto/auth/auth.dto-out'
// import {UserEntity } from '@interface/entities'
import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { hashPassword } from 'src/core/utils'
import { Repository } from 'typeorm'

const user = {
	id: '1',
	username: 'test',
	isDisabled: false,
	password: 'test',
	email: 'test@gmail.com',
	isLoginFirstTime: false,
}

@Controller('auth')
export class AuthController {
	private readonly accessTokenExpried = '1h'
	private readonly refreshTokenExpried = '1.5h'
	private readonly rounds = 10
	constructor() {} // private readonly userEntity: Repository<UserEntity>, // @InjectRepository(UserEntity)

	@Post('/hash-password')
	async hashPassword(@Body() body) {
		const hashedPassword = await hashPassword(body.password)
		return new ResponseDto({ data: hashedPassword })
	}

	@Post('/login')
	async login(@Body() body: LoginDtoIn): Promise<ResponseDto<LoginDtoOut>> {
		const { email, password } = body
		// const user = await this.userEntity.findOne({ where: { email, isDeleted: false } })

		if (!user) {
			throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		}
		// const isPasswordValid = await bcrypt.compare(password, user.password)
		// console.log('isPasswordValid', isPasswordValid)

		// if (!isPasswordValid) {
		// 	throw new UnauthorizedException(errorResponse.INCORRECT_CREDENTIALS)
		// }

		if (user.isDisabled === true) throw new UnauthorizedException(errorResponse.USER_DISABLED)

		const paylod = {
			sub: user.id,
			id: user.id,
			email: user.email,
		}
		const accessToken = jwt.sign(paylod, process.env.JWT_SECRET, { expiresIn: this.accessTokenExpried })
		const refreshToken = jwt.sign(paylod, process.env.JWT_SECRET_REFRESH, {
			expiresIn: this.refreshTokenExpried,
		})

		return new ResponseDto({
			data: { id: user.id, accessToken, refreshToken, isLoginFirstTime: user.isLoginFirstTime },
		})
	}

	@Post('/refresh-token')
	async refreshToken(@Body() body: RefreshTokenDtoIn): Promise<ResponseDto<RefreshTokenDtoOut>> {
		try {
			const data = jwt.verify(body.refreshToken, process.env.JWT_SECRET_REFRESH) as UserJwtPayload
			// const user = await this.userEntity.findOne({ where: { id: data.id } })
			if (!user) {
				throw new UnauthorizedException(errorResponse.USER_NOT_FOUND)
			}

			const paylod = {
				sub: user.id,
				id: user.id,
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
