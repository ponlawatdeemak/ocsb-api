import { UserJwtPayload, UserMeta } from '@interface/auth.type'
import { ResponseDto, StatustoOut } from '@interface/config/app.config'
import { errorResponse } from '@interface/config/error.config'
import {
	ChangePasswordProfileDtoIn,
	ForgetPasswordDtoIn,
	LoginDtoIn,
	RefreshTokenDtoIn,
	ResetPasswordForgotPasswordDtoIn,
	VerifyTokenForgotPasswordDtoIn,
} from '@interface/dto/auth/auth.dto-in'
import { LoginDtoOut, RefreshTokenDtoOut, VerifyTokenForgotPasswordDtoOut } from '@interface/dto/auth/auth.dto-out'
import { UsersEntity } from '@interface/entities'
import { Body, Controller, Post, UnauthorizedException, BadRequestException, UseGuards, Put } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { generateTokenHex, hashPassword, hash } from 'src/core/utils'
import { EntityManager, Repository } from 'typeorm'
import { MailService } from 'src/core/mail.service'
import { AuthGuard } from 'src/core/auth.guard'
import { User } from 'src/core/user.decorator'
@Controller('auth')
export class AuthController {
	private readonly accessTokenExpried = '1h'
	private readonly refreshTokenExpried = '1.5h'

	constructor(
		private readonly mailService: MailService,
		private readonly config: ConfigService,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,

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
		const user = await this.userEntity.findOne({ where: { email, isDeleted: false } })
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

	@Post('/forget-password')
	async forgotPassword(@Body() payload: ForgetPasswordDtoIn): Promise<ResponseDto<StatustoOut>> {
		const email = payload.email

		const user = await this.userEntity.findOne({ where: { email, isDeleted: false } })
		if (!user) throw new BadRequestException(errorResponse.USER_NOT_FOUND)

		// read config
		const RESET_PASSWORD_TIMEOUT = this.config.get<number>('RESET_PASSWORD_TIMEOUT')
		const RESET_PASSWORD_FRONTEND_URL = this.config.get<number>('RESET_PASSWORD_FRONTEND_URL')

		// genereate token and link
		const resetToken = generateTokenHex(16)
		const resetLink = `${RESET_PASSWORD_FRONTEND_URL}${resetToken}`

		const now = new Date()

		// set to user row
		user.resetPasswordExpire = new Date(now.getTime() + 60 * 60 * 1000 * RESET_PASSWORD_TIMEOUT)
		user.resetPasswordToken = resetToken
		await this.userEntity.save(user)

		// send mail
		await this.mailService.sendResetPassword(user.email, user.firstName, resetLink, RESET_PASSWORD_TIMEOUT)

		return new ResponseDto({ data: { success: true } })
	}

	@Post('/verify-token')
	async verifyToken(
		@Body() payload: VerifyTokenForgotPasswordDtoIn,
	): Promise<ResponseDto<VerifyTokenForgotPasswordDtoOut>> {
		const resetPasswordToken = payload.token

		const user = await this.userEntity.findOneBy({ resetPasswordToken, isDeleted: false })
		if (!user) throw new BadRequestException(errorResponse.INVALID_TOKEN)

		const now = new Date()

		if (now > user.resetPasswordExpire) throw new BadRequestException(errorResponse.EXPIRED_TOKEN)

		return new ResponseDto({ data: { isValid: true } })
	}

	@Put('/reset-password')
	async resetPassword(@Body() payload: ResetPasswordForgotPasswordDtoIn): Promise<ResponseDto<StatustoOut>> {
		const resetPasswordToken = payload.token

		await this.entityManager.transaction(async (transactionalEntityManager) => {
			const user = await transactionalEntityManager.findOneBy(UsersEntity, {
				resetPasswordToken,
				isDeleted: false,
			})
			// validate
			if (!user) throw new BadRequestException(errorResponse.INVALID_TOKEN)

			const now = new Date()
			if (now > user.resetPasswordExpire) throw new BadRequestException(errorResponse.EXPIRED_TOKEN)

			// set user row
			user.password = await hash(payload.newPassword)
			user.resetPasswordToken = null
			user.resetPasswordExpire = null
			user.updatedBy = user.userId
			user.updatedAt = new Date()
			await transactionalEntityManager.save(user)

			// create log
			// const newLog = new LogUserEntity()
			// newLog.operatedAccount = user.email
			// newLog.operatedBy = { id: user.id }
			// newLog.operatedDt = new Date()
			// newLog.type = { id: LutLogUserType.resetPassword }
			// await transactionalEntityManager.save(newLog)
		})

		return new ResponseDto({ data: { success: true } })
	}

	@Put('/change-password')
	@UseGuards(AuthGuard)
	async changePassword(
		@User() user: UserMeta,
		@Body() putData: ChangePasswordProfileDtoIn,
	): Promise<ResponseDto<StatustoOut>> {
		const id = user.id
		// start transcation
		await this.entityManager.transaction(async (transactionalEntityManager) => {
			const userRow = await transactionalEntityManager.findOneBy(UsersEntity, { userId: id })

			const IsValidOldPassword = await bcrypt.compare(putData.oldPassword, userRow.password)

			if (!IsValidOldPassword) throw new BadRequestException('Invalid old password')

			userRow.password = await hashPassword(putData.newPassword)
			userRow.updatedAt = new Date()
			userRow.updatedBy = id
			// update user
			await transactionalEntityManager.save(userRow)

			// insert log
			// const newLog = new LogUserEntity()
			// newLog.operatedDt = new Date()
			// newLog.operatedBy = { id }
			// newLog.type = { id: LutLogUserType.changePassword }
			// newLog.operatedAccount = userRow.email

			// await transactionalEntityManager.save(newLog)
		})

		return new ResponseDto({ data: { success: true } })
	}
}
